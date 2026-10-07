import { and, eq, gt, lte, desc, or, sql, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "../db/schema";
import { allowRequest } from "./auth/rate-limit";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requireUnblocked, unblocked } from "./services/access";
import { claimUploads } from "./services/uploads";
import { digest, randomToken } from "./auth/security";
import { storage } from "./services/storage";
import {
  notifyGroupMessage,
  notifyTextMentions,
} from "./services/mentions";
const id = z.number().int().positive();
const handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/);

function buildHandle(title: string, threadId: number) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "group";
  return `${base}-${threadId}`;
}
async function member(threadId: number, userId: number, accepted = true) {
  const [m] = await getDb()
    .select({ member: s.chatMembers, thread: s.chatThreads })
    .from(s.chatMembers)
    .innerJoin(s.chatThreads, eq(s.chatThreads.id, s.chatMembers.threadId))
    .where(
      and(
        eq(s.chatMembers.threadId, threadId),
        eq(s.chatMembers.userId, userId),
        accepted ? eq(s.chatMembers.accepted, true) : undefined,
        unblocked(userId, s.chatThreads.ownerId)
      )
    )
    .limit(1);
  if (!m)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation is unavailable",
    });
  return m;
}
export const chatRouter = createRouter({
  inbox: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: s.chatThreads.id,
        title: s.chatThreads.title,
        kind: s.chatThreads.kind,
        accepted: s.chatMembers.accepted,
        ownerId: s.chatThreads.ownerId,
        handle: s.chatThreads.handle,
        memberTag: s.chatMembers.memberTag,
        notifications: s.chatMembers.notifications,
      })
      .from(s.chatMembers)
      .innerJoin(s.chatThreads, eq(s.chatThreads.id, s.chatMembers.threadId))
      .where(
        and(
          eq(s.chatMembers.userId, ctx.user.id),
          unblocked(ctx.user.id, s.chatThreads.ownerId)
        )
      )
      .orderBy(desc(s.chatThreads.id))
      .limit(100)
  ),
  create: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(1).max(80),
        kind: z.enum(["group", "broadcast"]).default("group"),
        users: z.array(id).max(49).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const users = [...new Set(input.users)].filter(v => v !== ctx.user.id);
      for (const user of users) {
        await requireUnblocked(ctx.user.id, user);
        const [p] = await getDb()
          .select()
          .from(s.preferences)
          .where(eq(s.preferences.userId, user));
        if (p?.groupInvites === "nobody")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "A selected account does not accept invitations",
          });
        if ((p?.groupInvites ?? "followers") === "followers") {
          const [f] = await getDb()
            .select()
            .from(s.follows)
            .where(
              and(
                eq(s.follows.followerId, user),
                eq(s.follows.followingId, ctx.user.id),
                eq(s.follows.accepted, true)
              )
            );
          if (!f)
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Selected accounts must follow you or allow message requests",
            });
        }
      }
      return getDb().transaction(async tx => {
        const r = await tx.insert(s.chatThreads).values({
          ownerId: ctx.user.id,
          title: input.title,
          kind: input.kind,
        });
        const threadId = Number(r[0].insertId);
        await tx
          .update(s.chatThreads)
          .set({ handle: buildHandle(input.title, threadId) })
          .where(eq(s.chatThreads.id, threadId));
        await tx
          .insert(s.chatMembers)
          .values([
            { threadId, userId: ctx.user.id, accepted: true },
            ...users.map(userId => ({ threadId, userId, accepted: false })),
          ]);
        return { id: threadId };
      });
    }),
  accept: authedQuery
    .input(z.object({ threadId: id }))
    .mutation(async ({ ctx, input }) =>
      getDb().transaction(async tx => {
        await tx
          .select()
          .from(s.chatThreads)
          .where(eq(s.chatThreads.id, input.threadId))
          .for("update");
        const m = await member(input.threadId, ctx.user.id, false);
        if (m.member.accepted) return { ok: true };
        const [latest] = await tx
          .select({ id: s.chatMessages.id })
          .from(s.chatMessages)
          .where(eq(s.chatMessages.threadId, input.threadId))
          .orderBy(desc(s.chatMessages.id))
          .limit(1);
        await tx
          .update(s.chatMembers)
          .set({
            accepted: true,
            joinedAt: new Date(),
            historyAfterId: latest?.id ?? 0,
          })
          .where(eq(s.chatMembers.id, m.member.id));
        return { ok: true };
      })
    ),
  leave: authedQuery
    .input(z.object({ threadId: id }))
    .mutation(async ({ ctx, input }) =>
      getDb().transaction(async tx => {
        await tx
          .select()
          .from(s.chatThreads)
          .where(eq(s.chatThreads.id, input.threadId))
          .for("update");
        const m = await member(input.threadId, ctx.user.id, false);
        if (m.thread.ownerId === ctx.user.id)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "The owner must delete the channel instead",
          });
        await tx.delete(s.chatMembers).where(eq(s.chatMembers.id, m.member.id));
        return { ok: true };
      })
    ),
  deleteThread: authedQuery
    .input(z.object({ threadId: id }))
    .mutation(async ({ ctx, input }) =>
      getDb().transaction(async tx => {
        const [t] = await tx
          .select()
          .from(s.chatThreads)
          .where(
            and(
              eq(s.chatThreads.id, input.threadId),
              eq(s.chatThreads.ownerId, ctx.user.id)
            )
          )
          .for("update");
        if (!t) throw new TRPCError({ code: "FORBIDDEN" });
        const media = await tx
          .select({ key: s.chatMessages.attachmentKey })
          .from(s.chatMessages)
          .where(eq(s.chatMessages.threadId, t.id));
        for (const row of media)
          if (row.key)
            await tx
              .insert(s.mediaCleanup)
              .values({ key: row.key })
              .onDuplicateKeyUpdate({ set: { key: row.key } });
        await tx.delete(s.chatThreads).where(eq(s.chatThreads.id, t.id));
        return { ok: true };
      })
    ),
  details: authedQuery
    .input(z.object({ threadId: id }))
    .query(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      const members = await getDb()
        .select({
          userId: s.chatMembers.userId,
          username: s.profiles.username,
          lastReadId: s.chatMembers.lastReadId,
          memberTag: s.chatMembers.memberTag,
          notifications: s.chatMembers.notifications,
        })
        .from(s.chatMembers)
        .innerJoin(s.profiles, eq(s.profiles.userId, s.chatMembers.userId))
        .where(
          and(
            eq(s.chatMembers.threadId, input.threadId),
            eq(s.chatMembers.accepted, true),
            unblocked(ctx.user.id, s.chatMembers.userId)
          )
        )
        .limit(50);
      return {
        thread: m.thread,
        members,
        membership: {
          memberTag: m.member.memberTag,
          notifications: m.member.notifications,
        },
        translationEnabled: !!process.env.TRANSLATE_API_URL,
      };
    }),
  messages: authedQuery
    .input(
      z.object({
        threadId: id,
        before: id.optional(),
        pinnedOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      const rows = await getDb()
        .select()
        .from(s.chatMessages)
        .where(
          and(
            eq(s.chatMessages.threadId, input.threadId),
            isNull(s.chatMessages.deletedAt),
            unblocked(ctx.user.id, s.chatMessages.senderId),
            gt(s.chatMessages.id, m.member.historyAfterId),
            input.pinnedOnly ? eq(s.chatMessages.pinned, true) : undefined,
            input.pinnedOnly
              ? lte(s.chatMessages.deliverAt, new Date())
              : or(
                  lte(s.chatMessages.deliverAt, new Date()),
                  eq(s.chatMessages.senderId, ctx.user.id)
                ),
            input.before ? sql`${s.chatMessages.id}<${input.before}` : undefined
          )
        )
        .orderBy(desc(s.chatMessages.id))
        .limit(input.pinnedOnly ? 3 : 50);
      const ids = rows.map(r => r.id);
      const allReactions = ids.length
        ? await getDb()
            .select({
              messageId: s.chatReactions.messageId,
              reaction: s.chatReactions.reaction,
              userId: s.chatReactions.userId,
            })
            .from(s.chatReactions)
            .where(
              and(
                inArray(s.chatReactions.messageId, ids),
                unblocked(ctx.user.id, s.chatReactions.userId)
              )
            )
            .limit(5000)
        : [];
      const receipts = ids.length
        ? await getDb()
            .select()
            .from(s.chatReceipts)
            .where(
              and(
                inArray(s.chatReceipts.messageId, ids),
                unblocked(ctx.user.id, s.chatReceipts.userId)
              )
            )
            .limit(2500)
        : [];
      const mediaKeys = rows.flatMap(r =>
        r.attachmentKey ? [r.attachmentKey] : []
      );
      const { urls } = await storage.getPresignedUrls({ keys: mediaKeys });
      const mediaUrls = new Map(mediaKeys.map((key, i) => [key, urls[i]]));
      return Promise.all(
        rows.reverse().map(async row => {
          const reactions = allReactions.filter(r => r.messageId === row.id);
          const url = row.attachmentKey
            ? mediaUrls.get(row.attachmentKey) || null
            : null;
          return {
            id: row.id,
            senderId: row.senderId,
            text: row.text,
            url,
            contentType: row.contentType,
            replyId: row.replyId,
            pinned: row.pinned,
            editedAt: row.editedAt,
            deliverAt: row.deliverAt,
            createdAt: row.createdAt,
            reactions,
            myReaction:
              reactions.find(r => r.userId === ctx.user.id)?.reaction ?? null,
            readBy: receipts.filter(
              r => r.messageId === row.id && r.userId !== row.senderId
            ).length,
            isMine: row.senderId === ctx.user.id,
          };
        })
      );
    }),
  send: authedQuery
    .input(
      z.object({
        threadId: id,
        text: z.string().trim().max(2000).default(""),
        uploadId: z.string().length(43).optional(),
        replyId: id.optional(),
        deliverAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.text && !input.uploadId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a message or attachment",
        });
      if (
        input.deliverAt &&
        (input.deliverAt.getTime() < Date.now() + 30000 ||
          input.deliverAt.getTime() > Date.now() + 29 * 86400000)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Schedule between 30 seconds and 29 days ahead",
        });
      return getDb().transaction(async tx => {
        const [thread] = await tx
          .select()
          .from(s.chatThreads)
          .where(eq(s.chatThreads.id, input.threadId))
          .for("update");
        const m = await member(input.threadId, ctx.user.id);
        if (thread.kind === "broadcast" && thread.ownerId !== ctx.user.id)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the owner can publish to this broadcast channel",
          });
        if (input.replyId) {
          const [reply] = await tx
            .select()
            .from(s.chatMessages)
            .where(
              and(
                eq(s.chatMessages.id, input.replyId),
                eq(s.chatMessages.threadId, input.threadId),
                isNull(s.chatMessages.deletedAt),
                lte(s.chatMessages.deliverAt, new Date()),
                gt(s.chatMessages.id, m.member.historyAfterId),
                unblocked(ctx.user.id, s.chatMessages.senderId)
              )
            );
          if (!reply)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Reply target unavailable",
            });
        }
        const media = input.uploadId
          ? (await claimUploads(tx, [input.uploadId], ctx.user.id, "chat"))[0]
          : undefined;
        const r = await tx.insert(s.chatMessages).values({
          threadId: input.threadId,
          senderId: ctx.user.id,
          text: input.text,
          attachmentKey: media?.key,
          contentType: media?.contentType,
          replyId: input.replyId,
          deliverAt: input.deliverAt ?? new Date(),
        });
        const messageId = Number(r[0].insertId);
        return { id: messageId };
      }).then(async result => {
        if (!input.deliverAt || input.deliverAt <= new Date()) {
          await notifyGroupMessage({
            actorId: ctx.user.id,
            threadId: input.threadId,
          });
          await notifyTextMentions({
            actorId: ctx.user.id,
            text: input.text,
            threadId: input.threadId,
          });
        }
        return result;
      });
    }),
  update: authedQuery
    .input(
      z.object({
        id,
        action: z.enum(["edit", "delete", "pin", "unpin"]),
        text: z.string().trim().min(1).max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(s.chatMessages)
        .where(eq(s.chatMessages.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await getDb().transaction(async tx => {
        const [thread] = await tx
          .select()
          .from(s.chatThreads)
          .where(eq(s.chatThreads.id, row.threadId))
          .for("update");
        const m = await member(row.threadId, ctx.user.id);
        const [message] = await tx
          .select()
          .from(s.chatMessages)
          .where(
            and(
              eq(s.chatMessages.id, input.id),
              isNull(s.chatMessages.deletedAt),
              unblocked(ctx.user.id, s.chatMessages.senderId),
              gt(s.chatMessages.id, m.member.historyAfterId)
            )
          )
          .for("update");
        if (!message) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.action === "edit" || input.action === "delete") {
          if (message.senderId !== ctx.user.id)
            throw new TRPCError({ code: "FORBIDDEN" });
          if (input.action === "edit") {
            if (
              !input.text ||
              Date.now() - message.createdAt.getTime() > 900000
            )
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "Messages can be edited for 15 minutes",
              });
            await tx
              .update(s.chatMessages)
              .set({ text: input.text, editedAt: new Date() })
              .where(eq(s.chatMessages.id, message.id));
          } else {
            if (message.attachmentKey)
              await tx
                .insert(s.mediaCleanup)
                .values({ key: message.attachmentKey })
                .onDuplicateKeyUpdate({ set: { key: message.attachmentKey } });
            await tx
              .update(s.chatMessages)
              .set({
                deletedAt: new Date(),
                text: "",
                attachmentKey: null,
                pinned: false,
              })
              .where(eq(s.chatMessages.id, message.id));
          }
        } else {
          if (
            message.deliverAt > new Date() ||
            (thread.kind === "broadcast" && thread.ownerId !== ctx.user.id)
          )
            throw new TRPCError({ code: "FORBIDDEN" });
          if (input.action === "pin" && !message.pinned) {
            const [n] = await tx
              .select({ n: sql<number>`COUNT(*)` })
              .from(s.chatMessages)
              .where(
                and(
                  eq(s.chatMessages.threadId, message.threadId),
                  eq(s.chatMessages.pinned, true),
                  isNull(s.chatMessages.deletedAt)
                )
              );
            if (Number(n.n) >= 3)
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "You can pin up to three messages",
              });
          }
          await tx
            .update(s.chatMessages)
            .set({ pinned: input.action === "pin" })
            .where(eq(s.chatMessages.id, message.id));
        }
      });
      return { ok: true };
    }),
  react: authedQuery
    .input(
      z.object({
        id,
        reaction: z.enum(["❤️", "👏", "😂", "😮", "😢", "🔥"]),
        remove: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [message] = await getDb()
        .select()
        .from(s.chatMessages)
        .where(
          and(
            eq(s.chatMessages.id, input.id),
            isNull(s.chatMessages.deletedAt),
            lte(s.chatMessages.deliverAt, new Date()),
            unblocked(ctx.user.id, s.chatMessages.senderId)
          )
        );
      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      const m = await member(message.threadId, ctx.user.id);
      if (message.id <= m.member.historyAfterId)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (input.remove)
        await getDb()
          .delete(s.chatReactions)
          .where(
            and(
              eq(s.chatReactions.userId, ctx.user.id),
              eq(s.chatReactions.messageId, message.id)
            )
          );
      else
        await getDb()
          .insert(s.chatReactions)
          .values({
            userId: ctx.user.id,
            messageId: message.id,
            reaction: input.reaction,
          })
          .onDuplicateKeyUpdate({ set: { reaction: input.reaction } });
      return { ok: true };
    }),
  read: authedQuery
    .input(z.object({ threadId: id, messageId: id }))
    .mutation(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      const [message] = await getDb()
        .select()
        .from(s.chatMessages)
        .where(
          and(
            eq(s.chatMessages.id, input.messageId),
            eq(s.chatMessages.threadId, input.threadId),
            lte(s.chatMessages.deliverAt, new Date()),
            isNull(s.chatMessages.deletedAt),
            unblocked(ctx.user.id, s.chatMessages.senderId)
          )
        );
      if (!message || message.id <= m.member.historyAfterId)
        throw new TRPCError({ code: "NOT_FOUND" });
      await getDb()
        .update(s.chatMembers)
        .set({
          lastReadId: sql`GREATEST(${s.chatMembers.lastReadId}, ${message.id})`,
        })
        .where(eq(s.chatMembers.id, m.member.id));
      const delivered = await getDb()
        .select({ id: s.chatMessages.id })
        .from(s.chatMessages)
        .where(
          and(
            eq(s.chatMessages.threadId, input.threadId),
            gt(s.chatMessages.id, m.member.historyAfterId),
            lte(s.chatMessages.id, input.messageId),
            lte(s.chatMessages.deliverAt, new Date()),
            isNull(s.chatMessages.deletedAt),
            unblocked(ctx.user.id, s.chatMessages.senderId)
          )
        )
        .orderBy(desc(s.chatMessages.id))
        .limit(50);
      if (delivered.length)
        await getDb()
          .insert(s.chatReceipts)
          .values(
            delivered.map(row => ({ messageId: row.id, userId: ctx.user.id }))
          )
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
      return { ok: true };
    }),
  readDisplayed: authedQuery
    .input(z.object({ threadId: id, messageIds: z.array(id).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      const ids = [...new Set(input.messageIds)];
      const rows = await getDb()
        .select({ id: s.chatMessages.id })
        .from(s.chatMessages)
        .where(
          and(
            eq(s.chatMessages.threadId, input.threadId),
            inArray(s.chatMessages.id, ids),
            gt(s.chatMessages.id, m.member.historyAfterId),
            lte(s.chatMessages.deliverAt, new Date()),
            isNull(s.chatMessages.deletedAt),
            unblocked(ctx.user.id, s.chatMessages.senderId)
          )
        );
      if (rows.length !== ids.length)
        throw new TRPCError({ code: "NOT_FOUND" });
      await getDb().transaction(async tx => {
        await tx
          .insert(s.chatReceipts)
          .values(rows.map(row => ({ messageId: row.id, userId: ctx.user.id })))
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
        await tx
          .update(s.chatMembers)
          .set({
            lastReadId: sql`GREATEST(${s.chatMembers.lastReadId}, ${Math.max(...ids)})`,
          })
          .where(eq(s.chatMembers.id, m.member.id));
      });
      return { ok: true };
    }),
  invite: authedQuery
    .input(z.object({ threadId: id }))
    .mutation(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      if (m.thread.ownerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      const code = randomToken();
      await getDb()
        .update(s.chatThreads)
        .set({
          inviteHash: digest(code),
          inviteExpiresAt: new Date(Date.now() + 7 * 86400000),
        })
        .where(eq(s.chatThreads.id, input.threadId));
      return { code };
    }),
  join: authedQuery
    .input(z.object({ code: z.string().length(43) }))
    .mutation(async ({ ctx, input }) =>
      getDb().transaction(async tx => {
        const [thread] = await tx
          .select()
          .from(s.chatThreads)
          .where(
            and(
              eq(s.chatThreads.inviteHash, digest(input.code)),
              gt(s.chatThreads.inviteExpiresAt, new Date()),
              unblocked(ctx.user.id, s.chatThreads.ownerId)
            )
          )
          .for("update");
        if (!thread)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation expired or unavailable",
          });
        const [prior] = await tx
          .select()
          .from(s.chatMembers)
          .where(
            and(
              eq(s.chatMembers.threadId, thread.id),
              eq(s.chatMembers.userId, ctx.user.id)
            )
          );
        if (prior?.accepted) return { id: thread.id };
        const [latest] = await tx
          .select({ id: s.chatMessages.id })
          .from(s.chatMessages)
          .where(eq(s.chatMessages.threadId, thread.id))
          .orderBy(desc(s.chatMessages.id))
          .limit(1);
        if (prior) {
          await tx
            .update(s.chatMembers)
            .set({
              accepted: true,
              historyAfterId: latest?.id ?? 0,
              joinedAt: new Date(),
            })
            .where(eq(s.chatMembers.id, prior.id));
          return { id: thread.id };
        }
        const [n] = await tx
          .select({ n: sql<number>`COUNT(*)` })
          .from(s.chatMembers)
          .where(eq(s.chatMembers.threadId, thread.id));
        if (Number(n.n) >= 50)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This group is full",
          });
        await tx.insert(s.chatMembers).values({
          threadId: thread.id,
          userId: ctx.user.id,
          accepted: true,
          historyAfterId: latest?.id ?? 0,
        });
        return { id: thread.id };
      })
    ),
  updateMembership: authedQuery
    .input(
      z.object({
        threadId: id,
        memberTag: z.string().trim().max(32).optional(),
        notifications: z.enum(["all", "mentions", "muted"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      await getDb()
        .update(s.chatMembers)
        .set({
          memberTag: input.memberTag?.trim() || null,
          notifications: input.notifications,
        })
        .where(eq(s.chatMembers.id, m.member.id));
      return { ok: true };
    }),
  updateThread: authedQuery
    .input(
      z.object({
        threadId: id,
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().max(240),
        handle,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const m = await member(input.threadId, ctx.user.id);
      if (m.thread.ownerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      const [clash] = await getDb()
        .select({ id: s.chatThreads.id })
        .from(s.chatThreads)
        .where(
          and(
            eq(s.chatThreads.handle, input.handle),
            sql`${s.chatThreads.id} <> ${input.threadId}`
          )
        )
        .limit(1);
      if (clash)
        throw new TRPCError({
          code: "CONFLICT",
          message: "That group handle is already in use",
        });
      await getDb()
        .update(s.chatThreads)
        .set({
          title: input.title,
          description: input.description || null,
          handle: input.handle,
        })
        .where(eq(s.chatThreads.id, input.threadId));
      return { ok: true };
    }),
  translate: authedQuery
    .input(z.object({ id, target: z.enum(["en", "fr", "yo"]) }))
    .mutation(async ({ ctx, input }) => {
      const base = process.env.TRANSLATE_API_URL;
      if (!base || new URL(base).protocol !== "https:")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Translation service has not been configured",
        });
      const [message] = await getDb()
        .select()
        .from(s.chatMessages)
        .where(
          and(
            eq(s.chatMessages.id, input.id),
            isNull(s.chatMessages.deletedAt),
            lte(s.chatMessages.deliverAt, new Date()),
            unblocked(ctx.user.id, s.chatMessages.senderId)
          )
        );
      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      const m = await member(message.threadId, ctx.user.id);
      if (message.id <= m.member.historyAfterId)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await allowRequest(`translate:${ctx.user.id}`, 5)))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Translation limit reached; try again in a minute",
        });
      const response = await fetch(
        new URL("translate", base.endsWith("/") ? base : `${base}/`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            q: message.text,
            source: "auto",
            target: input.target,
            format: "text",
            api_key: process.env.TRANSLATE_API_KEY,
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!response.ok)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Translation unavailable",
        });
      return z
        .object({ translatedText: z.string().max(10000) })
        .parse(await response.json());
    }),
});
