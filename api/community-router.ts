import { and, eq, gt, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "../db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  requirePost,
  requireUnblocked,
  requireStory,
  visiblePost,
  visibleComment,
  visibleAuthor,
  closeAudience,
  unblocked,
} from "./services/access";
import { postCards } from "./social-router";
import { claimUploads } from "./services/uploads";
import { storage } from "./services/storage";
const id = z.number().int().positive();
const reaction = z.enum(["❤️", "👏", "😂", "😮", "😢", "🔥"]);
export const communityRouter = createRouter({
  mySecurityEvents: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: s.securityEvents.id,
        event: s.securityEvents.event,
        createdAt: s.securityEvents.createdAt,
      })
      .from(s.securityEvents)
      .where(eq(s.securityEvents.userId, ctx.user.id))
      .orderBy(desc(s.securityEvents.id))
      .limit(50)
  ),
  clearLocation: authedQuery
    .input(z.object({ postId: id }))
    .mutation(async ({ ctx, input }) => {
      const p = await requirePost(input.postId, ctx.user.id);
      if (p.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await getDb()
        .delete(s.postLocations)
        .where(eq(s.postLocations.postId, p.id));
      return { ok: true };
    }),
  relationship: authedQuery
    .input(z.object({ userId: id }))
    .query(async ({ ctx, input }) => ({
      restricted: !!(
        await getDb()
          .select()
          .from(s.restrictions)
          .where(
            and(
              eq(s.restrictions.userId, ctx.user.id),
              eq(s.restrictions.targetId, input.userId)
            )
          )
          .limit(1)
      )[0],
      closeFriend: !!(
        await getDb()
          .select()
          .from(s.closeFriends)
          .where(
            and(
              eq(s.closeFriends.userId, ctx.user.id),
              eq(s.closeFriends.targetId, input.userId)
            )
          )
          .limit(1)
      )[0],
    })),
  relationshipUpdate: authedQuery
    .input(
      z.object({
        userId: id,
        kind: z.enum(["restrict", "close_friend"]),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose another account",
        });
      await requireUnblocked(ctx.user.id, input.userId);
      const table = input.kind === "restrict" ? s.restrictions : s.closeFriends;
      if (input.enabled)
        await getDb()
          .insert(table)
          .values({ userId: ctx.user.id, targetId: input.userId })
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
      else
        await getDb()
          .delete(table)
          .where(
            and(eq(table.userId, ctx.user.id), eq(table.targetId, input.userId))
          );
      return { ok: true };
    }),
  lists: authedQuery.query(async ({ ctx }) => ({
    closeFriends: await getDb()
      .select({ userId: s.profiles.userId, username: s.profiles.username })
      .from(s.closeFriends)
      .innerJoin(s.profiles, eq(s.profiles.userId, s.closeFriends.targetId))
      .where(eq(s.closeFriends.userId, ctx.user.id))
      .limit(200),
    restricted: await getDb()
      .select({ userId: s.profiles.userId, username: s.profiles.username })
      .from(s.restrictions)
      .innerJoin(s.profiles, eq(s.profiles.userId, s.restrictions.targetId))
      .where(eq(s.restrictions.userId, ctx.user.id))
      .limit(200),
  })),
  reply: authedQuery
    .input(z.object({ commentId: id, text: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const [parent] = await getDb()
        .select()
        .from(s.comments)
        .where(
          and(eq(s.comments.id, input.commentId), visibleComment(ctx.user.id))
        )
        .limit(1);
      if (!parent)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment is unavailable",
        });
      await requirePost(parent.postId, ctx.user.id);
      await getDb().insert(s.comments).values({
        userId: ctx.user.id,
        postId: parent.postId,
        parentId: parent.id,
        text: input.text,
      });
      return { ok: true };
    }),
  commentLikes: authedQuery
    .input(z.object({ postId: id }))
    .query(async ({ ctx, input }) => {
      await requirePost(input.postId, ctx.user.id);
      return getDb()
        .select({
          commentId: s.comments.id,
          parentId: s.comments.parentId,
          count: sql<number>`COUNT(${s.commentLikes.id})`,
          liked: sql<number>`COALESCE(MAX(${s.commentLikes.userId}=${ctx.user.id}),0)`,
        })
        .from(s.comments)
        .leftJoin(
          s.commentLikes,
          and(
            eq(s.commentLikes.commentId, s.comments.id),
            unblocked(ctx.user.id, s.commentLikes.userId)
          )
        )
        .where(
          and(eq(s.comments.postId, input.postId), visibleComment(ctx.user.id))
        )
        .groupBy(s.comments.id)
        .limit(100);
    }),
  likeComment: authedQuery
    .input(z.object({ commentId: id, like: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await getDb()
        .select()
        .from(s.comments)
        .where(
          and(eq(s.comments.id, input.commentId), visibleComment(ctx.user.id))
        )
        .limit(1);
      if (!comment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment unavailable",
        });
      await requirePost(comment.postId, ctx.user.id);
      if (input.like)
        await getDb()
          .insert(s.commentLikes)
          .values({ userId: ctx.user.id, commentId: comment.id })
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
      else
        await getDb()
          .delete(s.commentLikes)
          .where(
            and(
              eq(s.commentLikes.userId, ctx.user.id),
              eq(s.commentLikes.commentId, comment.id)
            )
          );
      return { ok: true };
    }),
  repost: authedQuery
    .input(z.object({ postId: id, enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requirePost(input.postId, ctx.user.id);
      if (input.enabled)
        await getDb()
          .insert(s.reposts)
          .values({ userId: ctx.user.id, postId: input.postId })
          .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
      else
        await getDb()
          .delete(s.reposts)
          .where(
            and(
              eq(s.reposts.userId, ctx.user.id),
              eq(s.reposts.postId, input.postId)
            )
          );
      return { ok: true };
    }),
  reposted: authedQuery
    .input(z.object({ userId: id.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const owner = input.userId ?? ctx.user.id;
      const rows = await getDb()
        .select({ post: s.posts })
        .from(s.reposts)
        .innerJoin(s.posts, eq(s.posts.id, s.reposts.postId))
        .where(
          and(
            eq(s.reposts.userId, owner),
            visibleAuthor(ctx.user.id, owner),
            visiblePost(ctx.user.id)
          )
        )
        .orderBy(desc(s.reposts.id))
        .limit(50);
      return postCards(
        rows.map(r => r.post),
        ctx.user.id
      );
    }),
  collections: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(s.collections)
      .where(eq(s.collections.userId, ctx.user.id))
      .limit(100)
  ),
  createCollection: authedQuery
    .input(z.object({ name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const r = await getDb()
        .insert(s.collections)
        .values({ userId: ctx.user.id, name: input.name });
      return { id: Number(r[0].insertId) };
    }),
  collection: authedQuery
    .input(z.object({ id }))
    .query(async ({ ctx, input }) => {
      const [c] = await getDb()
        .select()
        .from(s.collections)
        .where(
          and(
            eq(s.collections.id, input.id),
            eq(s.collections.userId, ctx.user.id)
          )
        );
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await getDb()
        .select({ post: s.posts })
        .from(s.collectionPosts)
        .innerJoin(s.posts, eq(s.posts.id, s.collectionPosts.postId))
        .where(
          and(
            eq(s.collectionPosts.collectionId, c.id),
            visiblePost(ctx.user.id)
          )
        )
        .limit(100);
      return postCards(
        rows.map(r => r.post),
        ctx.user.id
      );
    }),
  collect: authedQuery
    .input(z.object({ collectionId: id, postId: id, enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requirePost(input.postId, ctx.user.id);
      await getDb().transaction(async tx => {
        const [c] = await tx
          .select()
          .from(s.collections)
          .where(
            and(
              eq(s.collections.id, input.collectionId),
              eq(s.collections.userId, ctx.user.id)
            )
          )
          .for("update");
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.enabled) {
          await tx
            .insert(s.savedPosts)
            .values({ userId: ctx.user.id, postId: input.postId })
            .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
          await tx
            .insert(s.collectionPosts)
            .values({ collectionId: c.id, postId: input.postId })
            .onDuplicateKeyUpdate({ set: { postId: input.postId } });
        } else
          await tx
            .delete(s.collectionPosts)
            .where(
              and(
                eq(s.collectionPosts.collectionId, c.id),
                eq(s.collectionPosts.postId, input.postId)
              )
            );
      });
      return { ok: true };
    }),
  deleteCollection: authedQuery
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(s.collections)
        .where(
          and(
            eq(s.collections.id, input.id),
            eq(s.collections.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),
  search: authedQuery
    .input(z.object({ q: z.string().trim().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const q = input.q.toLowerCase().replace(/^#/, "");
      const rows = await getDb()
        .select({ post: s.posts })
        .from(s.postTags)
        .innerJoin(s.posts, eq(s.posts.id, s.postTags.postId))
        .where(and(eq(s.postTags.tag, q), visiblePost(ctx.user.id)))
        .orderBy(desc(s.posts.id))
        .limit(50);
      return postCards(
        rows.map(r => r.post),
        ctx.user.id
      );
    }),
  friendsReels: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(s.posts)
      .where(
        and(
          eq(s.posts.kind, "reel"),
          visiblePost(ctx.user.id),
          sql`EXISTS(SELECT 1 FROM follows f1 WHERE f1.followerId=${ctx.user.id} AND f1.followingId=${s.posts.userId} AND f1.accepted=1) AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.followerId=${s.posts.userId} AND f2.followingId=${ctx.user.id} AND f2.accepted=1)`
        )
      )
      .orderBy(desc(s.posts.id))
      .limit(30);
    return postCards(rows, ctx.user.id);
  }),
  note: authedQuery
    .input(
      z.object({
        text: z.string().trim().max(60),
        closeFriends: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.text)
        await getDb().delete(s.notes).where(eq(s.notes.userId, ctx.user.id));
      else {
        const values = {
          text: input.text,
          closeFriends: input.closeFriends,
          expiresAt: new Date(Date.now() + 86400000),
        };
        await getDb()
          .insert(s.notes)
          .values({ userId: ctx.user.id, ...values })
          .onDuplicateKeyUpdate({ set: values });
      }
      return { ok: true };
    }),
  notes: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: s.notes.id,
        userId: s.notes.userId,
        username: s.profiles.username,
        text: s.notes.text,
        expiresAt: s.notes.expiresAt,
      })
      .from(s.notes)
      .innerJoin(s.profiles, eq(s.profiles.userId, s.notes.userId))
      .where(
        and(
          gt(s.notes.expiresAt, new Date()),
          unblocked(ctx.user.id, s.notes.userId),
          closeAudience(ctx.user.id, s.notes.userId, s.notes.closeFriends),
          sql`(${s.notes.userId}=${ctx.user.id} OR (${s.notes.closeFriends}=1 AND EXISTS(SELECT 1 FROM close_friends cf WHERE cf.userId=${s.notes.userId} AND cf.targetId=${ctx.user.id})) OR (EXISTS(SELECT 1 FROM follows f1 WHERE f1.followerId=${ctx.user.id} AND f1.followingId=${s.notes.userId} AND f1.accepted=1) AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.followerId=${s.notes.userId} AND f2.followingId=${ctx.user.id} AND f2.accepted=1)))`
        )
      )
      .limit(50)
  ),
  storyReaction: authedQuery
    .input(
      z.object({
        storyId: id,
        reaction,
        reply: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireStory(input.storyId, ctx.user.id);
      await getDb()
        .insert(s.storyReactions)
        .values({ userId: ctx.user.id, ...input })
        .onDuplicateKeyUpdate({
          set: { reaction: input.reaction, reply: input.reply ?? null },
        });
      return { ok: true };
    }),
  storyReplies: authedQuery
    .input(z.object({ storyId: id }))
    .query(async ({ ctx, input }) => {
      const story = await requireStory(input.storyId, ctx.user.id);
      if (story.userId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      return getDb()
        .select({
          id: s.storyReactions.id,
          userId: s.storyReactions.userId,
          username: s.profiles.username,
          reaction: s.storyReactions.reaction,
          reply: s.storyReactions.reply,
        })
        .from(s.storyReactions)
        .innerJoin(s.profiles, eq(s.profiles.userId, s.storyReactions.userId))
        .where(
          and(
            eq(s.storyReactions.storyId, story.id),
            unblocked(ctx.user.id, s.storyReactions.userId)
          )
        )
        .limit(100);
    }),
  sendInstant: authedQuery
    .input(
      z.object({
        uploadId: z.string().length(43),
        recipients: z.array(id).min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recipients = [...new Set(input.recipients)].filter(
        v => v !== ctx.user.id
      );
      if (!recipients.length) throw new TRPCError({ code: "BAD_REQUEST" });
      for (const user of recipients) {
        await requireUnblocked(ctx.user.id, user);
        const [allowed] = await getDb()
          .select({ id: s.users.id })
          .from(s.users)
          .where(
            and(
              eq(s.users.id, user),
              sql`(EXISTS(SELECT 1 FROM close_friends cf WHERE cf.userId=${ctx.user.id} AND cf.targetId=${user}) OR (EXISTS(SELECT 1 FROM follows f WHERE f.followerId=${ctx.user.id} AND f.followingId=${user} AND f.accepted=1) AND EXISTS(SELECT 1 FROM follows f WHERE f.followerId=${user} AND f.followingId=${ctx.user.id} AND f.accepted=1)))`
            )
          );
        if (!allowed)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Instants are for Close Friends or mutual followers",
          });
      }
      return getDb().transaction(async tx => {
        const [media] = await claimUploads(
          tx,
          [input.uploadId],
          ctx.user.id,
          "instant"
        );
        const r = await tx.insert(s.instants).values({
          userId: ctx.user.id,
          key: media.key,
          expiresAt: new Date(Date.now() + 86400000),
        });
        const instantId = Number(r[0].insertId);
        await tx
          .insert(s.instantRecipients)
          .values(recipients.map(userId => ({ instantId, userId })));
        return { id: instantId };
      });
    }),
  instants: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: s.instants.id,
        username: s.profiles.username,
        expiresAt: s.instants.expiresAt,
        openedAt: s.instantRecipients.openedAt,
      })
      .from(s.instantRecipients)
      .innerJoin(s.instants, eq(s.instants.id, s.instantRecipients.instantId))
      .innerJoin(s.profiles, eq(s.profiles.userId, s.instants.userId))
      .where(
        and(
          eq(s.instantRecipients.userId, ctx.user.id),
          gt(s.instants.expiresAt, new Date()),
          unblocked(ctx.user.id, s.instants.userId)
        )
      )
      .orderBy(desc(s.instants.id))
      .limit(50)
  ),
  openInstant: authedQuery
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      const key = await getDb().transaction(async tx => {
        const [row] = await tx
          .select({
            key: s.instants.key,
            openedAt: s.instantRecipients.openedAt,
            recipientId: s.instantRecipients.id,
          })
          .from(s.instantRecipients)
          .innerJoin(
            s.instants,
            eq(s.instants.id, s.instantRecipients.instantId)
          )
          .where(
            and(
              eq(s.instants.id, input.id),
              eq(s.instantRecipients.userId, ctx.user.id),
              gt(s.instants.expiresAt, new Date()),
              unblocked(ctx.user.id, s.instants.userId)
            )
          )
          .for("update");
        if (!row || row.openedAt)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This Instant expired or was already opened",
          });
        await tx
          .update(s.instantRecipients)
          .set({ openedAt: new Date() })
          .where(eq(s.instantRecipients.id, row.recipientId));
        return row.key;
      });
      const bytes = await storage.readFile(key);
      return { image: `data:image/webp;base64,${bytes.toString("base64")}` };
    }),
  setLocation: authedQuery
    .input(
      z.object({
        postId: id,
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const p = await requirePost(input.postId, ctx.user.id);
      if (p.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const values = {
        latitude: Math.round(input.latitude * 100),
        longitude: Math.round(input.longitude * 100),
      };
      await getDb()
        .insert(s.postLocations)
        .values({ postId: p.id, ...values })
        .onDuplicateKeyUpdate({ set: values });
      return { ok: true };
    }),
  map: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({
        post: s.posts,
        latitude: s.postLocations.latitude,
        longitude: s.postLocations.longitude,
      })
      .from(s.postLocations)
      .innerJoin(s.posts, eq(s.posts.id, s.postLocations.postId))
      .where(visiblePost(ctx.user.id))
      .orderBy(desc(s.posts.id))
      .limit(100);
    const cards = await postCards(
      rows.map(r => r.post),
      ctx.user.id
    );
    return rows.map((r, i) => ({
      latitude: r.latitude / 100,
      longitude: r.longitude / 100,
      post: cards[i],
    }));
  }),
  preferences: authedQuery.query(
    async ({ ctx }) =>
      (
        await getDb()
          .select()
          .from(s.preferences)
          .where(eq(s.preferences.userId, ctx.user.id))
          .limit(1)
      )[0] ?? {
        userId: ctx.user.id,
        theme: "system" as const,
        language: "en" as const,
        requests: "followers" as const,
        groupInvites: "followers" as const,
        mentions: "followers" as const,
        readReceipts: true,
      }
  ),
  setPreferences: authedQuery
    .input(
      z.object({
        theme: z.enum(["system", "light", "dark"]),
        language: z.enum(["en", "fr", "yo"]),
        requests: z.enum(["followers", "everyone", "nobody"]),
        groupInvites: z.enum(["followers", "everyone", "nobody"]),
        mentions: z.enum(["followers", "everyone", "nobody"]),
        readReceipts: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .insert(s.preferences)
        .values({ userId: ctx.user.id, ...input })
        .onDuplicateKeyUpdate({ set: input });
      return { ok: true };
    }),
  drafts: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(s.drafts)
      .where(eq(s.drafts.userId, ctx.user.id))
      .orderBy(desc(s.drafts.updatedAt))
      .limit(50)
  ),
  saveDraft: authedQuery
    .input(z.object({ caption: z.string().max(2200) }))
    .mutation(async ({ ctx, input }) => {
      const [n] = await getDb()
        .select({ n: sql<number>`COUNT(*)` })
        .from(s.drafts)
        .where(eq(s.drafts.userId, ctx.user.id));
      if (Number(n.n) >= 50)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Remove a draft before adding another",
        });
      await getDb()
        .insert(s.drafts)
        .values({ userId: ctx.user.id, caption: input.caption });
      return { ok: true };
    }),
  deleteDraft: authedQuery
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(s.drafts)
        .where(
          and(eq(s.drafts.id, input.id), eq(s.drafts.userId, ctx.user.id))
        );
      return { ok: true };
    }),
  creator: authedQuery.query(async ({ ctx }) => ({
    gifts: await getDb()
      .select({
        id: s.gifts.id,
        amount: s.gifts.amount,
        createdAt: s.gifts.createdAt,
      })
      .from(s.gifts)
      .where(eq(s.gifts.creatorId, ctx.user.id))
      .orderBy(desc(s.gifts.id))
      .limit(100),
    subscribers: await getDb()
      .select({
        id: s.subscriptions.id,
        username: s.profiles.username,
        expiresAt: s.subscriptions.expiresAt,
      })
      .from(s.subscriptions)
      .innerJoin(s.profiles, eq(s.profiles.userId, s.subscriptions.userId))
      .where(
        and(
          eq(s.subscriptions.creatorId, ctx.user.id),
          gt(s.subscriptions.expiresAt, new Date()),
          unblocked(ctx.user.id, s.subscriptions.userId)
        )
      )
      .limit(100),
    posts: await getDb()
      .select({
        id: s.posts.id,
        caption: s.posts.caption,
        createdAt: s.posts.createdAt,
        likes: sql<number>`(SELECT COUNT(*) FROM likes l WHERE l.postId=${s.posts.id})`,
        comments: sql<number>`(SELECT COUNT(*) FROM comments c WHERE c.postId=${s.posts.id})`,
        saves: sql<number>`(SELECT COUNT(*) FROM saved_posts sp WHERE sp.postId=${s.posts.id})`,
        reposts: sql<number>`(SELECT COUNT(*) FROM reposts rp WHERE rp.postId=${s.posts.id})`,
      })
      .from(s.posts)
      .where(eq(s.posts.userId, ctx.user.id))
      .orderBy(desc(s.posts.id))
      .limit(100),
  })),
});
