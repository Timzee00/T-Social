import { beforeAll, describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyIdentityToken } from "../api/auth/providers";
let pair: Awaited<ReturnType<typeof generateKeyPair>>,
  jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  pair = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" }],
  });
});
const token = (
  claims: Record<string, unknown> = {},
  secret = () => pair.privateKey
) =>
  new SignJWT({ sub: "user", nonce: "nonce", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://issuer.example")
    .setAudience("client")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
describe("OIDC verification with signed tokens", () => {
  it("accepts a correctly signed token with expected identity claims", async () => {
    const result = await verifyIdentityToken(
      await token(),
      jwks,
      "https://issuer.example",
      "client",
      "nonce"
    );
    expect(result.sub).toBe("user");
  });
  it("rejects the wrong signature, issuer, audience and nonce", async () => {
    const other = await generateKeyPair("RS256");
    await expect(
      verifyIdentityToken(
        await token({}, () => other.privateKey),
        jwks,
        "https://issuer.example",
        "client",
        "nonce"
      )
    ).rejects.toThrow();
    const jwt = await token();
    await expect(
      verifyIdentityToken(jwt, jwks, "https://other.example", "client", "nonce")
    ).rejects.toThrow();
    await expect(
      verifyIdentityToken(jwt, jwks, "https://issuer.example", "other", "nonce")
    ).rejects.toThrow();
    await expect(
      verifyIdentityToken(
        jwt,
        jwks,
        "https://issuer.example",
        "client",
        "wrong"
      )
    ).rejects.toThrow();
  });
  it("rejects expired tokens and missing subject", async () => {
    const expired = await new SignJWT({ sub: "user", nonce: "nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://issuer.example")
      .setAudience("client")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(pair.privateKey);
    await expect(
      verifyIdentityToken(
        expired,
        jwks,
        "https://issuer.example",
        "client",
        "nonce"
      )
    ).rejects.toThrow();
    await expect(
      verifyIdentityToken(
        await token({ sub: undefined }),
        jwks,
        "https://issuer.example",
        "client",
        "nonce"
      )
    ).rejects.toThrow();
  });
});
