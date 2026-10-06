import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { validateAmount } from "../api/wallet/ledger";
import { webhookSignature, cashEnabled } from "../api/wallet/paystack";
import { hashtags } from "../api/services/hashtags";
afterEach(() => vi.unstubAllEnvs());
describe("wallet input boundaries", () => {
  it("rejects fractional, negative, zero, infinite and unsafe amounts", () => {
    for (const n of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      expect(() => validateAmount(n)).toThrow();
    expect(() => validateAmount(1)).not.toThrow();
  });
  it("verifies exact raw-body HMAC and rejects changes and malformed signatures", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture");
    const body = '{"event":"charge.success"}';
    const signature = createHmac("sha512", "sk_test_fixture")
      .update(body)
      .digest("hex");
    expect(webhookSignature(body, signature)).toBe(true);
    expect(webhookSignature(`${body} `, signature)).toBe(false);
    expect(webhookSignature(body, "ff")).toBe(false);
    expect(webhookSignature(body, undefined)).toBe(false);
  });
  it("keeps cash off by default", () => {
    vi.stubEnv("WALLET_CASH_ENABLED", "");
    expect(cashEnabled()).toBe(false);
  });
  it("normalizes and deduplicates bounded Unicode hashtags", () => {
    expect(hashtags("#Lagos #lagos #旅行 #good_day")).toEqual([
      "lagos",
      "旅行",
      "good_day",
    ]);
    expect(hashtags("a#ignored")).toEqual([]);
  });
});
import { rankPosts } from "../api/services/recommendations";
describe("bounded personalized ranking", () => {
  it("retains all candidate IDs while favoring fresh posts and diversifying authors", () => {
    const now = Date.now(),
      rows = [
        { id: 3, userId: 1, createdAt: new Date(now) },
        { id: 2, userId: 1, createdAt: new Date(now - 1000) },
        { id: 1, userId: 2, createdAt: new Date(now - 2000) },
      ];
    const ranked = rankPosts(rows, new Set(), new Map(), now);
    expect(ranked.map(p => p.id)).toEqual([3, 1, 2]);
    expect(new Set(ranked.map(p => p.id))).toEqual(
      new Set(rows.map(p => p.id))
    );
  });
});
