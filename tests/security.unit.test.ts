import { describe, it, expect } from "vitest";
import {
  digest,
  identityHash,
  randomToken,
  safeEqual,
  validOrigin,
  validTransaction,
  validatePhone,
  validateCode,
  validateIdentityClaims,
} from "../api/auth/security";
import { timeAgo } from "../src/lib/time";
describe("authentication boundaries", () => {
  it("creates independent high-entropy tokens", () => {
    const a = randomToken(),
      b = randomToken();
    expect(a).toHaveLength(43);
    expect(a).not.toBe(b);
    expect(digest(a)).toHaveLength(64);
  });
  it("requires the exact origin, rejecting missing and cross-site origins", () => {
    for (const origin of [
      null,
      "https://evil.example",
      "http://localhost:3000.attacker.example",
      "null",
    ])
      expect(
        validOrigin(
          new Headers(origin ? { origin } : {}),
          "http://localhost:3000"
        )
      ).toBe(false);
    expect(
      validOrigin(
        new Headers({ origin: "http://localhost:3000" }),
        "http://localhost:3000"
      )
    ).toBe(true);
    expect(
      validOrigin(
        new Headers({
          origin: "http://localhost:3000",
          "sec-fetch-site": "cross-site",
        }),
        "http://localhost:3000"
      )
    ).toBe(false);
  });
  it("binds OAuth state to browser, provider, expiry and one-time consumption", () => {
    const browser = randomToken();
    const tx = {
      bindingHash: digest(browser),
      provider: "google",
      expiresAt: new Date(Date.now() + 1000),
      consumedAt: null,
    };
    expect(validTransaction(tx, browser, "google")).toBe(true);
    expect(validTransaction(tx, randomToken(), "google")).toBe(false);
    expect(validTransaction(tx, browser, "facebook")).toBe(false);
    expect(
      validTransaction({ ...tx, consumedAt: new Date() }, browser, "google")
    ).toBe(false);
    expect(
      validTransaction({ ...tx, expiresAt: new Date(0) }, browser, "google")
    ).toBe(false);
  });
  it("namespaces external identities by provider, issuer and client, rather than email", () => {
    const a = identityHash("google", "issuer", "client", "subject");
    expect(a).not.toBe(identityHash("facebook", "issuer", "client", "subject"));
    expect(a).not.toBe(identityHash("google", "other", "client", "subject"));
    expect(a).not.toBe(identityHash("google", "issuer", "other", "subject"));
  });
  it("rejects malformed phone numbers and OTPs", () => {
    expect(validatePhone("+2348012345678")).toBe("+2348012345678");
    for (const v of ["08012345678", "+0123456789", "+234<script>", 123])
      expect(() => validatePhone(v)).toThrow();
    for (const v of ["123", "hello", "12345678901", 123456])
      expect(() => validateCode(v)).toThrow();
    expect(validateCode("123456")).toBe("123456");
  });
  it("rejects wrong nonce and authorized-party claims", () => {
    expect(() =>
      validateIdentityClaims({ sub: "user", nonce: "wrong" }, "nonce", "client")
    ).toThrow();
    expect(() =>
      validateIdentityClaims(
        { sub: "user", nonce: "nonce", aud: ["client", "other"], azp: "other" },
        "nonce",
        "client"
      )
    ).toThrow();
    expect(() =>
      validateIdentityClaims({ sub: "user", nonce: "nonce" }, "nonce", "client")
    ).not.toThrow();
  });
  it("compares variable length secrets without throwing", () => {
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "aa")).toBe(false);
    expect(safeEqual("a", "a")).toBe(true);
  });
  it("handles invalid and future timestamps", () => {
    expect(timeAgo("invalid")).toBe("");
    expect(timeAgo(new Date(Date.now() + 10000))).toBe("0s");
  });
});
