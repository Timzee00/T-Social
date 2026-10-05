import * as jose from "jose";
import { env } from "../lib/env";
import { validateIdentityClaims } from "./security";
export type Provider = "google" | "facebook" | "chatgpt";
export type Identity = {
  provider: Provider;
  issuer: string;
  client: string;
  subject: string;
  name: string | null;
  email: string | null;
};
export function providerConfig(provider: string) {
  if (
    provider === "google" &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  )
    return {
      provider: "google" as const,
      client: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
      issuer: "https://accounts.google.com",
      authorization: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      jwks: "https://www.googleapis.com/oauth2/v3/certs",
      scope: "openid email profile",
    };
  if (provider === "chatgpt" && process.env.OPENAI_CLIENT_ID)
    return {
      provider: "chatgpt" as const,
      client: process.env.OPENAI_CLIENT_ID,
      secret: process.env.OPENAI_CLIENT_SECRET || "",
      issuer: "https://auth.openai.com",
      authorization: "https://auth.openai.com/api/accounts/authorize",
      token: "https://auth.openai.com/api/accounts/oauth/token",
      jwks: "https://auth.openai.com/.well-known/jwks.json",
      scope: "openid email profile",
    };
  if (
    provider === "facebook" &&
    process.env.FACEBOOK_APP_ID &&
    process.env.FACEBOOK_APP_SECRET &&
    /^v\d+\.\d+$/.test(process.env.FACEBOOK_GRAPH_VERSION || "")
  ) {
    const version = process.env.FACEBOOK_GRAPH_VERSION;
    return {
      provider: "facebook" as const,
      client: process.env.FACEBOOK_APP_ID,
      secret: process.env.FACEBOOK_APP_SECRET,
      issuer: "https://www.facebook.com",
      authorization: `https://www.facebook.com/${version}/dialog/oauth`,
      token: `https://graph.facebook.com/${version}/oauth/access_token`,
      jwks: "",
      scope: "public_profile,email",
    };
  }
  return null;
}
export const phoneEnabled = () =>
  !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );
export const callbackUrl = (provider: string) =>
  `${env.publicUrl}/api/auth/${provider}/callback`;
export async function providerJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Identity provider request failed");
  return response.json() as Promise<Record<string, unknown>>;
}
const jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();
export async function exchangeIdentity(
  provider: Provider,
  code: string,
  verifier: string,
  nonce: string
): Promise<Identity> {
  const config = providerConfig(provider);
  if (!config) throw new Error("Provider unavailable");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.client,
    redirect_uri: callbackUrl(provider),
  });
  if (config.secret) body.set("client_secret", config.secret);
  if (provider !== "facebook") body.set("code_verifier", verifier);
  const token = await providerJson(config.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (provider === "facebook") {
    if (typeof token.access_token !== "string")
      throw new Error("Access token missing");
    const debug = new URL(
      `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION}/debug_token`
    );
    debug.searchParams.set("input_token", token.access_token);
    const validated = await providerJson(debug.toString(), {
      headers: { authorization: `Bearer ${config.client}|${config.secret}` },
    });
    const data = validated.data as
      | {
          app_id?: string;
          is_valid?: boolean;
          user_id?: string;
          expires_at?: number;
        }
      | undefined;
    if (
      !data?.is_valid ||
      data.app_id !== config.client ||
      !data.user_id ||
      !data.expires_at ||
      data.expires_at <= Date.now() / 1000
    )
      throw new Error("Invalid Facebook identity");
    const profile = await providerJson(
      `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION}/me?fields=id,name,email`,
      { headers: { authorization: `Bearer ${token.access_token}` } }
    );
    if (profile.id !== data.user_id)
      throw new Error("Facebook subject mismatch");
    return {
      provider,
      issuer: config.issuer,
      client: config.client,
      subject: data.user_id,
      name:
        typeof profile.name === "string" ? profile.name.slice(0, 100) : null,
      email: typeof profile.email === "string" ? profile.email : null,
    };
  }
  if (typeof token.id_token !== "string") throw new Error("ID token missing");
  let jwks = jwksCache.get(config.jwks);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(config.jwks), {
      timeoutDuration: 10000,
    });
    jwksCache.set(config.jwks, jwks);
  }
  const payload = await verifyIdentityToken(
    token.id_token,
    jwks,
    config.issuer,
    config.client,
    nonce
  );
  return {
    provider,
    issuer: config.issuer,
    client: config.client,
    subject: payload.sub!,
    name: typeof payload.name === "string" ? payload.name.slice(0, 100) : null,
    email:
      payload.email_verified === true && typeof payload.email === "string"
        ? payload.email.slice(0, 320)
        : null,
  };
}

export async function verifyIdentityToken(
  token: string,
  jwks: jose.JWTVerifyGetKey,
  issuer: string,
  client: string,
  nonce: string
) {
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer,
    audience: client,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce"],
    clockTolerance: 5,
  });
  validateIdentityClaims(payload, nonce, client);
  return payload;
}
