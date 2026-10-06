import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
export const cashEnabled = () =>
  process.env.WALLET_CASH_ENABLED === "true" &&
  /^sk_(test|live)_/.test(process.env.PAYSTACK_SECRET_KEY || "");
export function requireCash() {
  if (!cashEnabled())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Cash payments are not enabled. T Coins cannot be withdrawn.",
    });
}
export function webhookSignature(body: string, signature: string | undefined) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature))
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    createHmac("sha512", secret).update(body).digest()
  );
}
export async function paystack(path: string, body?: Record<string, unknown>) {
  requireCash();
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const result = z
    .object({ status: z.boolean(), data: z.unknown() })
    .safeParse(await response.json());
  if (!response.ok || !result.success || !result.data.status)
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "Payment provider could not complete the request. Pending transfers remain reserved until verified.",
    });
  return result.data.data;
}
export const chargeResult = z.object({
  status: z.string(),
  reference: z.string(),
  amount: z.number().int().positive(),
  currency: z.literal("NGN"),
  fees: z.number().int().nonnegative(),
});
export const transferResult = z.object({
  status: z.string(),
  reference: z.string(),
  amount: z.number().int().positive(),
  currency: z.literal("NGN"),
  recipient: z.object({ recipient_code: z.string() }),
});
