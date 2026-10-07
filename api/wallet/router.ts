import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "../../db/schema";
import { createRouter, authedQuery, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { requireUnblocked, requirePost } from "../services/access";
import {
  ledgerTransaction,
  transfer,
  userAccount,
  walletBalances,
} from "./ledger";

const task = z.enum(["signup", "profile", "first_post"]);
const requestKey = z.string().uuid();

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
    const history = await getDb()
      .select({
        id: s.walletJournal.id,
        description: s.walletJournal.description,
        kind: s.walletJournal.kind,
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
      .where(
        and(
          eq(s.walletAccounts.userId, ctx.user.id),
          eq(s.walletAccounts.currency, "COIN"),
          eq(s.walletJournal.currency, "COIN")
        )
      )
      .orderBy(desc(s.walletJournal.id))
      .limit(50);
    return { ...balance, history };
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
          description: `${input.task} reward · virtual T Coins`,
          amount: { signup: 100, profile: 25, first_post: 50 }[input.task],
          from: { key: "platform:issuance:COIN", allowNegative: true },
          to: userAccount(ctx.user.id, "COIN"),
        })
      );
    }),

  sendCoins: authedQuery
    .input(
      z.object({
        userId: z.number().int().positive(),
        amount: z.number().int().min(1).max(100000),
        requestKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose another person",
        });
      await requireUnblocked(ctx.user.id, input.userId);
      const [target] = await getDb()
        .select({ id: s.profiles.userId })
        .from(s.profiles)
        .where(eq(s.profiles.userId, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      return ledgerTransaction(tx =>
        transfer(tx, {
          reference: `coin-send:${ctx.user.id}:${input.requestKey}`,
          currency: "COIN",
          kind: "peer_transfer",
          description: "T Coin transfer · virtual credits",
          amount: input.amount,
          from: userAccount(ctx.user.id, "COIN"),
          to: userAccount(input.userId, "COIN"),
        })
      );
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
          description: "Creator gift · virtual T Coins",
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
      if (input.creatorId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST" });
      return ledgerTransaction(async tx => {
        const result = await transfer(tx, {
          reference: `subscribe:${ctx.user.id}:${input.requestKey}`,
          currency: "COIN",
          kind: "subscription",
          description: "30-day supporter membership · 200 virtual T Coins",
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

  adminSummary: adminQuery.query(async () => {
    const [totals] = await getDb()
      .select({
        accounts: sql<number>`COUNT(*)`,
        positive: sql<number>`COALESCE(SUM(CASE WHEN ${s.walletAccounts.balance} > 0 THEN ${s.walletAccounts.balance} ELSE 0 END),0)`,
      })
      .from(s.walletAccounts)
      .where(eq(s.walletAccounts.currency, "COIN"));
    return {
      coinAccounts: Number(totals.accounts),
      circulatingCoins: Number(totals.positive),
    };
  }),

  grantCoins: adminQuery
    .input(
      z.object({
        userId: z.number().int().positive(),
        amount: z.number().int().min(1).max(1000000),
        reason: z.string().trim().min(3).max(120),
        requestKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [target] = await getDb()
        .select({ id: s.users.id })
        .from(s.users)
        .where(eq(s.users.id, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      return ledgerTransaction(tx =>
        transfer(tx, {
          reference: `admin-grant:${ctx.user.id}:${input.requestKey}`,
          currency: "COIN",
          kind: "admin_grant",
          description: input.reason,
          amount: input.amount,
          from: { key: "platform:issuance:COIN", allowNegative: true },
          to: userAccount(input.userId, "COIN"),
        })
      );
    }),

  audit: adminQuery.query(async () => {
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
      .where(eq(s.walletAccounts.currency, "COIN"))
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
      .where(eq(s.walletJournal.currency, "COIN"))
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
