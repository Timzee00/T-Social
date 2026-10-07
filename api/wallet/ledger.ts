import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { getDb } from "../queries/connection";
export type Currency = "COIN" | "NGN";
export type LedgerTx = Pick<
  MySql2Database<typeof schema>,
  "select" | "insert" | "update"
>;
export function validateAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid amount" });
}
export async function account(
  tx: LedgerTx,
  key: string,
  currency: Currency,
  userId?: number,
  allowNegative = false
) {
  await tx
    .insert(schema.walletAccounts)
    .values({ key, currency, userId, allowNegative })
    .onDuplicateKeyUpdate({ set: { key } });
  const [row] = await tx
    .select()
    .from(schema.walletAccounts)
    .where(eq(schema.walletAccounts.key, key))
    .limit(1);
  if (
    row.currency !== currency ||
    row.userId !== (userId ?? null) ||
    row.allowNegative !== allowNegative
  )
    throw new Error("Wallet account configuration mismatch");
  return row;
}
export function userAccount(userId: number, currency: Currency) {
  return { key: `user:${userId}:${currency}`, userId };
}
export async function transfer(
  tx: LedgerTx,
  input: {
    reference: string;
    currency: Currency;
    kind: string;
    description: string;
    amount: number;
    from: { key: string; userId?: number; allowNegative?: boolean };
    to: { key: string; userId?: number; allowNegative?: boolean };
  }
) {
  validateAmount(input.amount);
  if (input.from.key === input.to.key)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose another recipient",
    });
  // Every writer takes the same account lock order. No external API call belongs in this transaction.
  const accounts = [];
  for (const spec of [input.from, input.to].sort((a, b) =>
    a.key.localeCompare(b.key)
  ))
    accounts.push(
      await account(
        tx,
        spec.key,
        input.currency,
        spec.userId,
        spec.allowNegative
      )
    );
  const locked = await tx
    .select()
    .from(schema.walletAccounts)
    .where(
      inArray(
        schema.walletAccounts.id,
        accounts.map(a => a.id)
      )
    )
    .orderBy(schema.walletAccounts.id)
    .for("update");
  const from = locked.find(a => a.key === input.from.key)!,
    to = locked.find(a => a.key === input.to.key)!;
  const [prior] = await tx
    .select()
    .from(schema.walletJournal)
    .where(eq(schema.walletJournal.reference, input.reference))
    .limit(1);
  if (prior) {
    const entries = await tx
      .select()
      .from(schema.walletEntries)
      .where(eq(schema.walletEntries.journalId, prior.id));
    if (
      prior.kind !== input.kind ||
      prior.currency !== input.currency ||
      entries.length !== 2 ||
      !entries.some(
        e => e.accountId === from.id && e.amount === -input.amount
      ) ||
      !entries.some(e => e.accountId === to.id && e.amount === input.amount)
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "This request key was already used for another transaction",
      });
    return { id: prior.id, replayed: true };
  }
  if (from.frozen || to.frozen)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Wallet is under review",
    });
  if (!from.allowNegative && from.balance < input.amount)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Insufficient available balance",
    });
  if (
    ![from.balance - input.amount, to.balance + input.amount].every(
      Number.isSafeInteger
    )
  )
    throw new Error("Wallet balance exceeds safe integer range");
  const result = await tx.insert(schema.walletJournal).values({
    reference: input.reference,
    currency: input.currency,
    kind: input.kind,
    description: input.description,
  });
  const journalId = Number(result[0].insertId);
  await tx.insert(schema.walletEntries).values([
    { journalId, accountId: from.id, amount: -input.amount },
    { journalId, accountId: to.id, amount: input.amount },
  ]);
  await tx
    .update(schema.walletAccounts)
    .set({ balance: from.balance - input.amount })
    .where(eq(schema.walletAccounts.id, from.id));
  await tx
    .update(schema.walletAccounts)
    .set({ balance: to.balance + input.amount })
    .where(eq(schema.walletAccounts.id, to.id));
  return { id: journalId, replayed: false };
}
export async function ledgerTransaction<T>(
  fn: (tx: LedgerTx) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(fn);
    } catch (e) {
      const error = e as { code?: string; cause?: { code?: string } };
      if (
        attempt >= 2 ||
        !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
          error.code || error.cause?.code || ""
        )
      )
        throw e;
    }
  }
}
export async function walletBalances(userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.walletAccounts)
    .where(
      and(
        eq(schema.walletAccounts.userId, userId),
        eq(schema.walletAccounts.currency, "COIN")
      )
    );
  return {
    coins: rows[0]?.balance ?? 0,
    frozen: rows.some(a => a.frozen),
  };
}
