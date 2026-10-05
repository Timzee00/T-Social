import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

if (!process.env.DATABASE_URL?.split("?")[0].endsWith("/t_social_test")) {
  throw new Error("Production smoke tests require t_social_test");
}
const port = process.env.SMOKE_PORT || "3010";
const origin = "https://example.test";
const processUnderTest = spawn(process.execPath, ["dist/boot.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    PUBLIC_APP_URL: origin,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    S3_ENDPOINT: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
processUnderTest.stdout.on("data", chunk => {
  output = (output + chunk).slice(-4000);
});
processUnderTest.stderr.on("data", chunk => {
  output = (output + chunk).slice(-4000);
});
const base = `http://127.0.0.1:${port}`;
try {
  let response;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      response = await fetch(`${base}/api/healthz`);
      if (response.ok) break;
    } catch {
      /* Startup is still in progress. */
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(response?.status, 200, output);
  assert.match(
    response.headers.get("content-security-policy"),
    /object-src 'none'/
  );
  assert.match(response.headers.get("strict-transport-security"), /max-age=/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${base}/api/readyz`)).status, 200);
  const page = await fetch(`${base}/alice`, {
    headers: { accept: "text/html" },
  });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="root"><\/div>/);
  const missing = await fetch(`${base}/api/not-a-route`, {
    headers: { accept: "text/html" },
  });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /application\/json/);
  const request = {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: '{"json":null}',
  };
  assert.equal(
    (await fetch(`${base}/api/trpc/auth.logout`, request)).status,
    403
  );
  request.headers.origin = origin;
  const logout = await fetch(`${base}/api/trpc/auth.logout`, request);
  assert.equal(logout.status, 200);
  const cookie = logout.headers.get("set-cookie");
  for (const expected of [
    "__Host-t_session=",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
  ])
    assert.ok(cookie?.includes(expected), expected);
  console.log(
    "Production smoke passed: liveness, readiness, CSP/HSTS/frame/cache headers, SPA routing, API 404, CSRF and secure session cookie"
  );
} finally {
  processUnderTest.kill("SIGTERM");
}
