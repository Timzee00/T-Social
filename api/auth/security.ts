import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const identityHash = (
  provider: string,
  issuer: string,
  client: string,
  subject: string
) => digest(JSON.stringify([provider, issuer, client, subject]));
export const keyedHash = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function validOrigin(headers: Headers, origin: string) {
  return (
    headers.get("origin") === origin &&
    !["cross-site"].includes(headers.get("sec-fetch-site") || "")
  );
}
export function validatePhone(value: unknown): string {
  if (typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value))
    throw new Error("Use international format, for example +2348012345678");
  return value;
}
export function validateCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4,10}$/.test(value))
    throw new Error("Enter the verification code");
  return value;
}
export function validTransaction(
  tx: {
    expiresAt: Date;
    consumedAt: Date | null;
    bindingHash: string;
    provider: string;
  },
  binding: string,
  provider: string,
  now = Date.now()
) {
  return (
    tx.provider === provider &&
    !tx.consumedAt &&
    tx.expiresAt.getTime() > now &&
    safeEqual(tx.bindingHash, digest(binding))
  );
}
export function validateIdentityClaims(
  claims: { sub?: string; nonce?: unknown; azp?: unknown; aud?: unknown },
  nonce: string,
  client: string
) {
  if (
    !claims.sub ||
    !safeEqual(String(claims.nonce || ""), nonce) ||
    (Array.isArray(claims.aud) &&
      claims.aud.length > 1 &&
      claims.azp !== client)
  )
    throw new Error("Invalid identity token");
}
