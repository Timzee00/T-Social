import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { runMaintenance } from "./services/maintenance";
import { safeEqual, validOrigin, keyedHash } from "./auth/security";
import authRoutes from "./auth/routes";
import walletRoutes from "./wallet/routes";
import mediaRoutes from "./services/media-routes";
const app = new Hono<{ Bindings: HttpBindings }>();
app.use(
  "*",
  secureHeaders({
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
    contentSecurityPolicy: env.isProduction
      ? {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "https:", "blob:", "data:"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", "https:", "blob:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        }
      : undefined,
  })
);
app.use("/api/*", async (c, next) => {
  const id = randomUUID();
  c.header("x-request-id", id);
  c.header("cache-control", "no-store");
  if (
    !["/api/cron/maintenance", "/api/wallet/paystack"].includes(c.req.path) &&
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !validOrigin(c.req.raw.headers, env.publicUrl)
  )
    return c.json({ error: "Request origin rejected" }, 403);
  let ip = "local";
  if (process.env.TRUSTED_PROXY_IP_HEADER)
    ip = c.req.header(process.env.TRUSTED_PROXY_IP_HEADER) || "unknown";
  else {
    try {
      ip = getConnInfo(c).remote.address || "unknown";
    } catch {
      /* Vite adapter has no socket */
    }
  }
  c.req.raw.headers.set("x-t-client-key", keyedHash(env.sessionSecret, ip));
  const started = Date.now();
  await next();
  console.info(
    JSON.stringify({
      requestId: id,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - started,
    })
  );
});
app.use(
  bodyLimit({
    maxSize: 22 * 1024 * 1024,
    onError: c => c.json({ error: "Upload exceeds the request limit" }, 413),
  })
);
app.get("/api/healthz", c => c.json({ status: "ok" }));
app.get("/api/readyz", async c => {
  try {
    await getDb().execute(sql`SELECT 1`);
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
app.post("/api/cron/maintenance", async c => {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    secret.length < 32 ||
    !safeEqual(c.req.header("authorization") || "", `Bearer ${secret}`)
  )
    return c.json({ error: "Unauthorized" }, 401);
  return c.json(await runMaintenance());
});
app.route("/api/auth", authRoutes);
app.route("/api/media", mediaRoutes);
app.route("/api/wallet", walletRoutes);
app.use("/api/trpc/*", c =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError: ({ path, error }) =>
      console.error(
        JSON.stringify({ event: "rpc_error", path, code: error.code })
      ),
  })
);
app.all("/api/*", c => c.json({ error: "Not found" }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status);
  console.error(JSON.stringify({ event: "request_error", name: error.name }));
  return c.json({ error: "Unable to complete the request" }, 500);
});
export default app;
if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);
  serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000) });
}
