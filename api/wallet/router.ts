import { randomUUID, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "../../db/schema";
import { createRouter, authedQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { allowRequest } from "../auth/rate-limit";
import { requireUnblocked, requirePost } from "../services/access";
import {
  ledgerTransaction,
  transfer,
  userAccount,
  walletBalances,
} from "./ledger";
import { cashEnabled, requireCash, paystack } from "./paystack";
import { settleWithdrawal, settleFunding } from "./settlement";
import type { TrpcContext } from "../context";
const task = z.enum(["signup", "profile", "first_post"]);
const requestKey = z.string().uuid();
const financeQuery = adminQuery.use(({ ctx, next }) => {
  const operators = (process.env.WALLET_OPERATOR_IDS || "")
    .split(",")
    .map(v => Number(v.trim()))
    .filter(v => Number.isSafeInteger(v) && v > 0);
  if (!operators.includes(ctx.user.id))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Wallet operator access is required",
    });
  return next();
});
function fresh(ctx: TrpcContext) {
  if (
    !ctx.session?.createdAt ||
    Date.now() - ctx.session?.createdAt.getTime() > 300000
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Sign in again to authorize this wallet change",
    });
}
function deriveKey(pin: string, salt: string, length: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(pin, salt, length, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  );
}
async function pinHash(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await deriveKey(pin, salt, 32)).toString("hex")}`;
}
async function pinMatches(pin: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key || key.length !== 64) return false;
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    await deriveKey(pin, salt, 32)
  );
}
async function eligible(userId: number, type: z.infer<typeof task>) {
  if (type === "signup") return true;
  if (type === "profile") {
    const [p] = await getDb()
      .select()
      .from(s.profiles)
      .where(eq(s.profiles.userId, userId));
    return !!p?.displayName?.trim() && !!p.bio?.trim() && !!p.avatarKey;
  }
  const [p] = await getDb()
    .select({ id: s.posts.id })
    .from(s.posts)
    .where(
      and(
        eq(s.posts.userId, userId),
        eq(s.posts.moderated, false),
        sql`${s.posts.deletedAt} IS NULL`
      )
    )
    .limit(1);
  return !!p;
}
export const walletRouter = createRouter({
  summary: authedQuery.query(async ({ ctx }) => {
    const balance = await walletBalances(ctx.user.id);
    const [verification] = await getDb()
      .select()
      .from(s.walletVerification)
      .where(eq(s.walletVerification.userId, ctx.user.id));
    const history = await getDb()
      .select({
        id: s.walletJournal.id,
        description: s.walletJournal.description,
        kind: s.walletJournal.kind,
        currency: s.walletJournal.currency,
        amount: s.walletEntries.amount,
        createdAt: s.walletJournal.createdAt,
      })
      .from(s.walletEntries)
      .innerJoin(
        s.walletAccounts,
        eq(s.walletAccounts.id, s.walletEntries.accountId)
      )
      .innerJoin(
        s.walletJournal,
        eq(s.walletJournal.id, s.walletEntries.journalId)
      )
      .where(eq(s.walletAccounts.userId, ctx.user.id))
      .orderBy(desc(s.walletJournal.id))
      .limit(50);
    const payouts = await getDb()
      .select({
        id: s.withdrawals.id,
        amount: s.withdrawals.amount,
        status: s.withdrawals.status,
        createdAt: s.withdrawals.createdAt,
      })
      .from(s.withdrawals)
      .where(eq(s.withdrawals.userId, ctx.user.id))
      .orderBy(desc(s.withdrawals.id))
      .limit(20);
    return {
      ...balance,
      history,
      payouts,
      cashEnabled: cashEnabled(),
      testMode:
        process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") ?? false,
      verified: !!verification?.verifiedAt,
      hasPin: !!verification?.pinHash,
      recipientLabel: verification?.recipientLabel,
    };
  }),
  tasks: authedQuery.query(async ({ ctx }) => {
    const values: {
      id: "signup" | "profile" | "first_post";
      title: string;
      coins: number;
    }[] = [
      { id: "signup", title: "Welcome to T Social", coins: 100 },
      {
        id: "profile",
        title: "Complete your profile, photo and bio",
        coins: 25,
      },
      { id: "first_post", title: "Publish your first post", coins: 50 },
    ];
    return Promise.all(
      values.map(async t => ({
        ...t,
        eligible: await eligible(ctx.user.id, t.id),
        claimed: !!(
          await getDb()
            .select({ id: s.walletJournal.id })
            .from(s.walletJournal)
            .where(eq(s.walletJournal.reference, `task:${ctx.user.id}:${t.id}`))
            .limit(1)
        )[0],
      }))
    );
  }),
  claim: authedQuery
    .input(z.object({ task }))
    .mutation(async ({ ctx, input }) => {
      if (!(await eligible(ctx.user.id, input.task)))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Complete the task before claiming",
        });
      return ledgerTransaction(tx =>
        transfer(tx, {
          reference: `task:${ctx.user.id}:${input.task}`,
          currency: "COIN",
          kind: "task_reward",
          description: `${input.task} reward · virtual credits`,
          amount: { signup: 100, profile: 25, first_post: 50 }[input.task],
          from: { key: "platform:issuance:COIN", allowNegative: true },
          to: userAccount(ctx.user.id, "COIN"),
        })
      );
    }),
  campaigns: authedQuery.query(() =>
    getDb()
      .select({
        id: s.rewardCampaigns.id,
        title: s.rewardCampaigns.title,
        task: s.rewardCampaigns.task,
        amount: s.rewardCampaigns.amount,
        remaining: s.rewardCampaigns.remaining,
        expiresAt: s.rewardCampaigns.expiresAt,
      })
      .from(s.rewardCampaigns)
      .where(
        and(
          eq(s.rewardCampaigns.enabled, true),
          gt(s.rewardCampaigns.expiresAt, new Date())
        )
      )
      .limit(20)
  ),
  claimCash: authedQuery
    .input(z.object({ campaignId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireCash();
      const [v] = await getDb()
        .select()
        .from(s.walletVerification)
        .where(eq(s.walletVerification.userId, ctx.user.id));
      if (!v?.verifiedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Identity verification is required for funded rewards",
        });
      return ledgerTransaction(async tx => {
        const [c] = await tx
          .select()
          .from(s.rewardCampaigns)
          .where(eq(s.rewardCampaigns.id, input.campaignId))
          .for("update");
        if (
          !c ||
          !c.enabled ||
          c.expiresAt < new Date() ||
          !(await eligible(ctx.user.id, c.task))
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This campaign is unavailable or the task is incomplete",
          });
        const reference = `campaign:${c.id}:${ctx.user.id}`;
        const [prior] = await tx
          .select()
          .from(s.walletJournal)
          .where(eq(s.walletJournal.reference, reference));
        if (prior) return { replayed: true };
        if (c.remaining < c.amount)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Campaign budget is exhausted",
          });
        const result = await transfer(tx, {
          reference,
          currency: "NGN",
          kind: "funded_reward",
          description: c.title,
          amount: c.amount,
          from: { key: `campaign:${c.id}` },
          to: userAccount(ctx.user.id, "NGN"),
        });
        await tx
          .update(s.rewardCampaigns)
          .set({ remaining: c.remaining - c.amount })
          .where(eq(s.rewardCampaigns.id, c.id));
        return result;
      });
    }),
  setPin: authedQuery
    .input(
      z.object({
        pin: z.string().regex(/^\d{6}$/),
        currentPin: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      fresh(ctx);
      if (!(await allowRequest(`wallet-pin:${ctx.user.id}`, 5, 3600)))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Try again later",
        });
      await ledgerTransaction(async tx => {
        await tx
          .insert(s.walletVerification)
          .values({ userId: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
        const [v] = await tx
          .select()
          .from(s.walletVerification)
          .where(eq(s.walletVerification.userId, ctx.user.id))
          .for("update");
        if (
          v.pinHash &&
          (!input.currentPin ||
            !(await pinMatches(input.currentPin, v.pinHash)))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Current PIN is incorrect",
          });
        await tx
          .update(s.walletVerification)
          .set({ pinHash: await pinHash(input.pin) })
          .where(eq(s.walletVerification.userId, ctx.user.id));
        await tx
          .insert(s.securityEvents)
          .values({ userId: ctx.user.id, event: "wallet_pin_changed" });
      });
      return { ok: true };
    }),
  gift: authedQuery
    .input(
      z.object({
        creatorId: z.number().int().positive(),
        postId: z.number().int().positive().optional(),
        amount: z.number().int().min(1).max(1000),
        requestKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireUnblocked(ctx.user.id, input.creatorId);
      if (input.creatorId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose another creator",
        });
      if (
        input.postId &&
        (await requirePost(input.postId, ctx.user.id)).userId !==
          input.creatorId
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Post creator does not match",
        });
      return ledgerTransaction(async tx => {
        const reference = `gift:${ctx.user.id}:${input.requestKey}`;
        const result = await transfer(tx, {
          reference,
          currency: "COIN",
          kind: "gift",
          description: "Creator gift · virtual credits",
          amount: input.amount,
          from: userAccount(ctx.user.id, "COIN"),
          to: userAccount(input.creatorId, "COIN"),
        });
        if (!result.replayed)
          await tx.insert(s.gifts).values({
            userId: ctx.user.id,
            creatorId: input.creatorId,
            postId: input.postId,
            amount: input.amount,
            reference,
          });
        return result;
      });
    }),
  subscribe: authedQuery
    .input(z.object({ creatorId: z.number().int().positive(), requestKey }))
    .mutation(async ({ ctx, input }) => {
      await requireUnblocked(ctx.user.id, input.creatorId);
      return ledgerTransaction(async tx => {
        const result = await transfer(tx, {
          reference: `subscribe:${ctx.user.id}:${input.requestKey}`,
          currency: "COIN",
          kind: "subscription",
          description: "30-day creator supporter membership · 200 T Coins",
          amount: 200,
          from: userAccount(ctx.user.id, "COIN"),
          to: userAccount(input.creatorId, "COIN"),
        });
        if (!result.replayed) {
          const [old] = await tx
            .select()
            .from(s.subscriptions)
            .where(
              and(
                eq(s.subscriptions.userId, ctx.user.id),
                eq(s.subscriptions.creatorId, input.creatorId)
              )
            )
            .for("update");
          const expiresAt = new Date(
            Math.max(Date.now(), old?.expiresAt.getTime() ?? 0) + 30 * 86400000
          );
          await tx
            .insert(s.subscriptions)
            .values({
              userId: ctx.user.id,
              creatorId: input.creatorId,
              expiresAt,
            })
            .onDuplicateKeyUpdate({ set: { expiresAt } });
        }
        return result;
      });
    }),
  withdraw: authedQuery
    .input(
      z.object({
        amount: z.number().int().min(50000).max(5000000),
        pin: z.string().regex(/^\d{6}$/),
        requestKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireCash();
      fresh(ctx);
      if (!(await allowRequest(`withdraw:${ctx.user.id}`, 5, 3600)))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Withdrawal attempt limit reached",
        });
      return ledgerTransaction(async tx => {
        const [v] = await tx
          .select()
          .from(s.walletVerification)
          .where(eq(s.walletVerification.userId, ctx.user.id))
          .for("update");
        if (
          !v?.verifiedAt ||
          !v.recipientCode ||
          !v.pinHash ||
          !(await pinMatches(input.pin, v.pinHash))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Verified payout account and correct PIN required",
          });
        const [prior] = await tx
          .select()
          .from(s.withdrawals)
          .where(
            and(
              eq(s.withdrawals.userId, ctx.user.id),
              eq(s.withdrawals.requestKey, input.requestKey)
            )
          );
        if (prior) {
          if (prior.amount !== input.amount)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Request key already used",
            });
          return { reference: prior.reference };
        }
        const reference = `tsw_${randomUUID().replaceAll("-", "")}`;
        await transfer(tx, {
          reference: `reserve:${reference}`,
          currency: "NGN",
          kind: "withdrawal_reserved",
          description: "Withdrawal awaiting operator approval",
          amount: input.amount,
          from: userAccount(ctx.user.id, "NGN"),
          to: { key: `payout:${reference}` },
        });
        await tx.insert(s.withdrawals).values({
          userId: ctx.user.id,
          reference,
          requestKey: input.requestKey,
          amount: input.amount,
          recipientCode: v.recipientCode,
        });
        await tx.insert(s.securityEvents).values({
          userId: ctx.user.id,
          event: "withdrawal_requested",
          details: { reference, amount: input.amount },
        });
        return { reference };
      });
    }),
  operations: financeQuery.query(async () => ({
    campaigns: await getDb()
      .select()
      .from(s.rewardCampaigns)
      .orderBy(desc(s.rewardCampaigns.id))
      .limit(50),
    payouts: await getDb()
      .select()
      .from(s.withdrawals)
      .orderBy(desc(s.withdrawals.id))
      .limit(50),
    events: await getDb()
      .select()
      .from(s.securityEvents)
      .orderBy(desc(s.securityEvents.id))
      .limit(100),
    accounts: await getDb()
      .select()
      .from(s.walletAccounts)
      .where(sql`${s.walletAccounts.userId} IS NULL`)
      .limit(100),
  })),
  fund: financeQuery
    .input(z.object({ amount: z.number().int().min(10000).max(100000000) }))
    .mutation(async ({ ctx, input }) => {
      requireCash();
      fresh(ctx);
      if (!ctx.user.email)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "An operator email is required for checkout",
        });
      const reference = `tsf_${randomUUID().replaceAll("-", "")}`;
      await getDb()
        .insert(s.cashFunding)
        .values({ reference, amount: input.amount, userId: ctx.user.id });
      const result = z.object({ authorization_url: z.string().url() }).parse(
        await paystack("/transaction/initialize", {
          reference,
          amount: input.amount,
          currency: "NGN",
          email: ctx.user.email,
        })
      );
      if (
        new URL(result.authorization_url).hostname !== "checkout.paystack.com"
      )
        throw new Error("Unexpected checkout host");
      return { url: result.authorization_url, reference };
    }),
  verifyFunding: financeQuery
    .input(z.object({ reference: z.string().regex(/^tsf_[a-f0-9]{32}$/) }))
    .mutation(async ({ input }) => {
      await settleFunding(input.reference);
      return { ok: true };
    }),
  createCampaign: financeQuery
    .input(
      z.object({
        title: z.string().trim().min(3).max(80),
        task,
        amount: z.number().int().min(100).max(100000),
        budget: z.number().int().min(100).max(100000000),
        expiresAt: z.date().min(new Date()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireCash();
      fresh(ctx);
      if (input.budget < input.amount)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Budget must cover at least one reward",
        });
      return ledgerTransaction(async tx => {
        const result = await tx
          .insert(s.rewardCampaigns)
          .values({ ...input, remaining: input.budget });
        const id = Number(result[0].insertId);
        await transfer(tx, {
          reference: `allocate:${id}`,
          currency: "NGN",
          kind: "campaign_budget",
          description: input.title,
          amount: input.budget,
          from: { key: "platform:treasury:NGN" },
          to: { key: `campaign:${id}` },
        });
        return { id };
      });
    }),
  verifyIdentity: financeQuery
    .input(
      z.object({
        userId: z.number().int().positive(),
        verificationReference: z.string().trim().min(10).max(120),
        recipientCode: z.string().regex(/^RCP_[A-Za-z0-9]+$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireCash();
      fresh(ctx);
      const recipient = z
        .object({
          active: z.literal(true),
          recipient_code: z.string(),
          name: z.string(),
          currency: z.literal("NGN"),
        })
        .parse(
          await paystack(
            `/transferrecipient/${encodeURIComponent(input.recipientCode)}`
          )
        );
      if (recipient.recipient_code !== input.recipientCode)
        throw new Error("Recipient mismatch");
      const values = {
        verifiedAt: new Date(),
        verificationReference: input.verificationReference,
        recipientCode: input.recipientCode,
        recipientLabel: recipient.name.slice(0, 100),
      };
      await getDb().transaction(async tx => {
        await tx
          .insert(s.walletVerification)
          .values({ userId: input.userId, ...values })
          .onDuplicateKeyUpdate({ set: values });
        await tx.insert(s.securityEvents).values({
          userId: ctx.user.id,
          event: "identity_review_approved",
          details: {
            subject: input.userId,
            reference: input.verificationReference,
          },
        });
      });
      return { ok: true };
    }),
  processWithdrawal: financeQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireCash();
      fresh(ctx);
      // Claim before contacting the provider. Ambiguous responses must be reconciled, never auto-refunded or resubmitted.
      const row = await getDb().transaction(async tx => {
        const [p] = await tx
          .select()
          .from(s.withdrawals)
          .where(eq(s.withdrawals.id, input.id))
          .for("update");
        if (!p || p.status !== "reserved")
          throw new TRPCError({
            code: "CONFLICT",
            message: "Payout already submitted; reconcile its reference",
          });
        const [a] = await tx
          .select()
          .from(s.walletAccounts)
          .where(eq(s.walletAccounts.key, `payout:${p.reference}`));
        if (a?.frozen)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cash is under review",
          });
        await tx
          .update(s.withdrawals)
          .set({ status: "submitted" })
          .where(eq(s.withdrawals.id, p.id));
        return p;
      });
      await paystack("/transfer", {
        source: "balance",
        reference: row.reference,
        amount: row.amount,
        recipient: row.recipientCode,
        reason: "T Social funded earnings",
      });
      return { reference: row.reference };
    }),
  reconcile: financeQuery
    .input(z.object({ reference: z.string().regex(/^tsw_[a-f0-9]{32}$/) }))
    .mutation(async ({ input }) => {
      await settleWithdrawal(input.reference);
      return { ok: true };
    }),
  audit: financeQuery.query(async () => {
    const accounts = await getDb()
      .select({
        id: s.walletAccounts.id,
        balance: s.walletAccounts.balance,
        total: sql<number>`COALESCE(SUM(${s.walletEntries.amount}),0)`,
      })
      .from(s.walletAccounts)
      .leftJoin(
        s.walletEntries,
        eq(s.walletEntries.accountId, s.walletAccounts.id)
      )
      .groupBy(s.walletAccounts.id);
    const journals = await getDb()
      .select({
        id: s.walletJournal.id,
        total: sql<number>`COALESCE(SUM(${s.walletEntries.amount}),0)`,
        n: sql<number>`COUNT(${s.walletEntries.id})`,
      })
      .from(s.walletJournal)
      .leftJoin(
        s.walletEntries,
        eq(s.walletEntries.journalId, s.walletJournal.id)
      )
      .groupBy(s.walletJournal.id);
    return {
      accountsChecked: accounts.length,
      journalsChecked: journals.length,
      mismatches: accounts
        .filter(a => a.balance !== Number(a.total))
        .map(a => a.id),
      unbalanced: journals
        .filter(j => Number(j.total) !== 0 || Number(j.n) !== 2)
        .map(j => j.id),
    };
  }),
});
