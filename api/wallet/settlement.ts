import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as s from "../../db/schema";
import { getDb } from "../queries/connection";
import { ledgerTransaction, transfer, userAccount } from "./ledger";
import { paystack, chargeResult, transferResult } from "./paystack";
export async function settleFunding(reference: string) {
  const [fund] = await getDb()
    .select()
    .from(s.cashFunding)
    .where(eq(s.cashFunding.reference, reference))
    .limit(1);
  if (!fund) return;
  const verified = chargeResult.parse(
    await paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
  );
  if (
    verified.status !== "success" ||
    verified.reference !== reference ||
    verified.amount !== fund.amount ||
    verified.fees >= fund.amount
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment verification did not match the funding request",
    });
  await ledgerTransaction(async tx => {
    const [row] = await tx
      .select()
      .from(s.cashFunding)
      .where(eq(s.cashFunding.reference, reference))
      .for("update");
    if (row.settledAt) return;
    await transfer(tx, {
      reference: `fund:${reference}`,
      currency: "NGN",
      kind: "funding",
      description: "Verified reward funding after provider fees",
      amount: verified.amount - verified.fees,
      from: { key: "platform:external:NGN", allowNegative: true },
      to: { key: "platform:treasury:NGN" },
    });
    await tx
      .update(s.cashFunding)
      .set({ settledAt: new Date() })
      .where(eq(s.cashFunding.reference, reference));
  });
}
export async function settleWithdrawal(reference: string) {
  const [row] = await getDb()
    .select()
    .from(s.withdrawals)
    .where(eq(s.withdrawals.reference, reference))
    .limit(1);
  if (!row) return;
  const verified = transferResult.parse(
    await paystack(`/transfer/verify/${encodeURIComponent(reference)}`)
  );
  if (
    verified.reference !== reference ||
    verified.amount !== row.amount ||
    verified.recipient.recipient_code !== row.recipientCode
  )
    throw new Error("Transfer verification mismatch");
  if (!["success", "failed", "reversed"].includes(verified.status)) return;
  await ledgerTransaction(async tx => {
    const [payout] = await tx
      .select()
      .from(s.withdrawals)
      .where(eq(s.withdrawals.reference, reference))
      .for("update");
    if (payout.status === "failed") return;
    if (verified.status === "success") {
      if (payout.status === "paid") return;
      await transfer(tx, {
        reference: `paid:${reference}`,
        currency: "NGN",
        kind: "withdrawal_paid",
        description: "Provider confirmed withdrawal",
        amount: payout.amount,
        from: { key: `payout:${reference}` },
        to: { key: "platform:paid:NGN" },
      });
      await tx
        .update(s.withdrawals)
        .set({ status: "paid" })
        .where(eq(s.withdrawals.id, payout.id));
    } else {
      if (payout.status === "paid" && verified.status !== "reversed") return;
      await transfer(tx, {
        reference: `refund:${reference}`,
        currency: "NGN",
        kind: "withdrawal_refund",
        description: "Provider confirmed failed or reversed withdrawal",
        amount: payout.amount,
        from: {
          key:
            payout.status === "paid"
              ? "platform:paid:NGN"
              : `payout:${reference}`,
        },
        to: userAccount(payout.userId, "NGN"),
      });
      await tx
        .update(s.withdrawals)
        .set({ status: "failed" })
        .where(eq(s.withdrawals.id, payout.id));
    }
  });
}
