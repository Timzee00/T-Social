import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import * as cookie from "cookie";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { authTransactions } from "../../db/schema";
import { getDb } from "../queries/connection";
import { authenticate, cookieOptions, createSession } from "./sessions";
import { allowRequest } from "./rate-limit";
import {
  callbackUrl,
  providerConfig,
  exchangeIdentity,
  phoneEnabled,
  providerJson,
  type Provider,
} from "./providers";
import {
  digest,
  randomToken,
  validTransaction,
  validatePhone,
  validateCode,
} from "./security";
import { resolveAccount } from "./accounts";
const routes = new Hono();
const bindingCookie = "t_auth_binding";
function binding(headers: Headers) {
  return cookie.parse(headers.get("cookie") || "")[bindingCookie] || "";
}
const clearBinding = () =>
  cookie.serialize(bindingCookie, "", { ...cookieOptions, maxAge: 0 });
async function readInput(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw new HTTPException(400, { message: "Send valid request data" });
  }
}
routes.get("/providers", c =>
  c.json({
    providers: ["google", "facebook", "chatgpt"].filter(
      p => !!providerConfig(p)
    ),
    phone: phoneEnabled(),
    staging: process.env.STAGING_DEMO_LOGIN === "true",
  })
);
routes.post("/staging", async c => {
  if (process.env.STAGING_DEMO_LOGIN !== "true")
    return c.json({ error: "Staging sign-in is disabled" }, 404);
  if (
    !(await allowRequest(
      `staging-login:${c.req.header("x-t-client-key") || "shared"}`,
      20,
      3600
    ))
  )
    return c.json({ error: "Too many sign-in attempts" }, 429);
  const userId = await resolveAccount({
    provider: "staging",
    issuer: "t-social-render-staging",
    client: "t-social",
    subject: "demo-member",
    name: "T Social Demo",
    email: null,
  });
  c.header(
    "set-cookie",
    await createSession(userId, c.req.header("user-agent") || "Browser")
  );
  return c.json({ ok: true });
});

routes.post("/:provider/start", async c => {
  const provider = c.req.param("provider");
  const config = providerConfig(provider);
  if (!config)
    return c.json({ error: "This sign-in method is not configured" }, 503);
  if (
    !(await allowRequest(
      `auth-start:${c.req.header("x-t-client-key") || "shared"}`,
      20,
      3600
    ))
  )
    return c.json({ error: "Too many sign-in attempts" }, 429);
  const body = c.req.header("content-type")?.includes("application/json")
    ? await readInput(c)
    : {};
  if (body.link !== undefined && typeof body.link !== "boolean")
    return c.json({ error: "Invalid linking request" }, 400);
  const auth =
    body.link === true ? await authenticate(c.req.raw.headers) : undefined;
  if (
    body.link === true &&
    (!auth || Date.now() - auth.session.createdAt.getTime() > 5 * 60000)
  )
    return c.json({ error: "Sign in again before linking an account" }, 401);
  const state = randomToken(),
    browser = randomToken(),
    verifier = randomToken(),
    nonce = randomToken();
  await getDb()
    .insert(authTransactions)
    .values({
      tokenHash: digest(state),
      provider,
      bindingHash: digest(browser),
      verifier,
      nonce,
      linkUserId: auth?.user.id,
      expiresAt: new Date(Date.now() + 10 * 60000),
    });
  c.header(
    "set-cookie",
    cookie.serialize(bindingCookie, browser, { ...cookieOptions, maxAge: 600 })
  );
  const url = new URL(config.authorization);
  url.searchParams.set("client_id", config.client);
  url.searchParams.set("redirect_uri", callbackUrl(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  if (provider !== "facebook") {
    url.searchParams.set("nonce", nonce);
    url.searchParams.set(
      "code_challenge",
      Buffer.from(digest(verifier), "hex").toString("base64url")
    );
    url.searchParams.set("code_challenge_method", "S256");
  }
  return body.link === true ||
    c.req.header("content-type")?.includes("application/json")
    ? c.json({ url: url.toString() })
    : c.redirect(url.toString(), 303);
});
routes.get("/:provider/callback", async c => {
  const provider = c.req.param("provider"),
    state = c.req.query("state"),
    code = c.req.query("code");
  const browser = binding(c.req.raw.headers);
  c.header("set-cookie", clearBinding());
  if (
    !providerConfig(provider) ||
    !state ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    !browser
  )
    return c.redirect("/login?error=invalid_state", 303);
  const [tx] = await getDb()
    .select()
    .from(authTransactions)
    .where(eq(authTransactions.tokenHash, digest(state)))
    .limit(1);
  if (!tx || !validTransaction(tx, browser, provider))
    return c.redirect("/login?error=invalid_state", 303);
  const [claim] = await getDb()
    .update(authTransactions)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTransactions.tokenHash, tx.tokenHash),
        isNull(authTransactions.consumedAt),
        gt(authTransactions.expiresAt, new Date())
      )
    );
  if (claim.affectedRows !== 1)
    return c.redirect("/login?error=invalid_state", 303);
  if (tx.linkUserId) {
    const auth = await authenticate(c.req.raw.headers);
    if (auth?.user.id !== tx.linkUserId)
      return c.redirect("/login?error=invalid_state", 303);
  }
  if (!code || code.length > 4096 || c.req.query("error"))
    return c.redirect("/login?error=cancelled", 303);
  try {
    const identity = await exchangeIdentity(
      provider as Provider,
      code,
      tx.verifier,
      tx.nonce
    );
    const userId = await resolveAccount(identity, tx.linkUserId);
    c.header(
      "set-cookie",
      await createSession(userId, c.req.header("user-agent") || "Browser"),
      { append: true }
    );
    return c.redirect(tx.linkUserId ? "/settings" : "/", 303);
  } catch {
    return c.redirect("/login?error=provider_failed", 303);
  }
});
async function twilio(path: string, values: Record<string, string>) {
  return providerJson(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${path}`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(values),
    }
  );
}
routes.post("/phone/send", async c => {
  if (!phoneEnabled())
    return c.json({ error: "Phone sign-in is not configured" }, 503);
  const input = await readInput(c);
  let phone: string;
  try {
    phone = validatePhone(input.phone);
  } catch {
    return c.json(
      {
        error: "Use an international phone number, for example +2348012345678",
      },
      400
    );
  }
  if (
    !(await allowRequest(`sms-number:${phone}`, 3, 3600)) ||
    !(await allowRequest(
      `sms-ip:${c.req.header("x-t-client-key") || "shared"}`,
      5,
      3600
    )) ||
    !(await allowRequest(
      "sms-budget",
      Number(process.env.SMS_DAILY_LIMIT || 100),
      86400
    ))
  )
    return c.json({ error: "Please wait before requesting another code" }, 429);
  const state = randomToken(),
    browser = randomToken();
  await twilio("Verifications", { To: phone, Channel: "sms" });
  await getDb()
    .insert(authTransactions)
    .values({
      tokenHash: digest(state),
      provider: "phone",
      bindingHash: digest(browser),
      verifier: "",
      nonce: "",
      phone,
      expiresAt: new Date(Date.now() + 10 * 60000),
    });
  c.header(
    "set-cookie",
    cookie.serialize(bindingCookie, browser, { ...cookieOptions, maxAge: 600 })
  );
  return c.json({ challenge: state });
});
routes.post("/phone/verify", async c => {
  if (!phoneEnabled())
    return c.json({ error: "Phone sign-in is not configured" }, 503);
  const input = await readInput(c);
  let code: string;
  try {
    code = validateCode(input.code);
  } catch {
    return c.json({ error: "Enter the verification code" }, 400);
  }
  if (
    typeof input.challenge !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.challenge)
  )
    return c.json({ error: "Request a new code" }, 400);
  const hash = digest(input.challenge);
  const [tx] = await getDb()
    .select()
    .from(authTransactions)
    .where(eq(authTransactions.tokenHash, hash))
    .limit(1);
  if (
    !tx ||
    !tx.phone ||
    !validTransaction(tx, binding(c.req.raw.headers), "phone")
  )
    return c.json({ error: "Code expired. Request another" }, 400);
  const [attempt] = await getDb()
    .update(authTransactions)
    .set({ attempts: sql`${authTransactions.attempts}+1` })
    .where(
      and(
        eq(authTransactions.tokenHash, hash),
        isNull(authTransactions.consumedAt),
        gt(authTransactions.expiresAt, new Date()),
        sql`${authTransactions.attempts}<5`
      )
    );
  if (attempt.affectedRows !== 1)
    return c.json({ error: "Too many attempts. Request another code" }, 429);
  let result: Record<string, unknown>;
  try {
    result = await twilio("VerificationCheck", { To: tx.phone, Code: code });
  } catch {
    return c.json(
      { error: "Could not verify the code. Request another if it expired" },
      400
    );
  }
  if (result.status !== "approved" || result.to !== tx.phone)
    return c.json({ error: "Incorrect code" }, 400);
  const [claimed] = await getDb()
    .update(authTransactions)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTransactions.tokenHash, hash),
        isNull(authTransactions.consumedAt),
        gt(authTransactions.expiresAt, new Date())
      )
    );
  if (claimed.affectedRows !== 1)
    return c.json({ error: "Code already used" }, 400);
  const userId = await resolveAccount({
    provider: "phone",
    issuer: "twilio-verify",
    client: process.env.TWILIO_VERIFY_SERVICE_SID!,
    subject: tx.phone,
    name: null,
    email: null,
  });
  c.header(
    "set-cookie",
    await createSession(userId, c.req.header("user-agent") || "Browser")
  );
  c.header("set-cookie", clearBinding(), { append: true });
  return c.json({ ok: true });
});
export default routes;
