import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import { z } from "zod";
import { webhookSignature, cashEnabled } from "./paystack";
import { settleFunding, settleWithdrawal } from "./settlement";
import { getDb } from "../queries/connection";
import { eq } from "drizzle-orm";
import { securityEvents, walletAccounts } from "../../db/schema";
const routes = new Hono();
routes.use(
  "/paystack",
  bodyLimit({
    maxSize: 65536,
    onError: c => c.json({ error: "Event too large" }, 413),
  })
);
routes.post("/paystack", async c => {
  if (!cashEnabled()) return c.json({ error: "Payments unavailable" }, 503);
  const raw = await c.req.text();
  if (
    raw.length > 65536 ||
    !webhookSignature(raw, c.req.header("x-paystack-signature"))
  )
    return c.json({ error: "Invalid signature" }, 401);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid event" }, 400);
  }
  const parsed = z
    .object({
      event: z.string(),
      data: z.object({ reference: z.string().max(80).optional() }),
    })
    .safeParse(payload);
  if (!parsed.success) return c.json({ error: "Invalid event" }, 400);
  const { event, data } = parsed.data;
  if (event === "charge.success" && data.reference)
    await settleFunding(data.reference);
  if (
    ["transfer.success", "transfer.failed", "transfer.reversed"].includes(
      event
    ) &&
    data.reference
  )
    await settleWithdrawal(data.reference);
  if (event.startsWith("charge.dispute.") || event.startsWith("refund.")) {
    // A chargeback can exhaust campaign collateral: pause cash until an operator reconciles it.
    await getDb()
      .update(walletAccounts)
      .set({ frozen: true })
      .where(eq(walletAccounts.currency, "NGN"));
    await getDb()
      .insert(securityEvents)
      .values({ event: "payment_dispute_cash_paused", details: { event } });
  }
  return c.json({ received: true });
});
export default routes;
