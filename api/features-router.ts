import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, lt, desc, isNull, sql, inArray, or } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  profiles,
  follows,
  preferences,
  restrictions,
  blocks,
  posts,
  stories,
  storyViews,
  highlights,
  highlightStories,
  notifications,
  messages,
  reports,
  likes,
  comments,
  savedPosts,
} from "../db/schema";
import {
  visibleAuthor,
  visibleStory,
  unblocked,
  requirePost,
  requireUnblocked,
} from "./services/access";
import { postCards } from "./social-router";
import { storage } from "./services/storage";
const id = z.number().int().positive();
const since = () => new Date(Date.now() - 86400000);

export const featuresRouter = createRouter({
  privacy: authedQuery
    .input(z.object({ isPrivate: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().transaction(async tx => {
        await tx
          .update(profiles)
          .set({ isPrivate: input.isPrivate })
          .where(eq(profiles.userId, ctx.user.id));
        if (!input.isPrivate)
          await tx
            .update(follows)
            .set({ accepted: true })
            .where(eq(follows.followingId, ctx.user.id));
      });
      return { ok: true };
    }),
  followRequests: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        userId: profiles.userId,
        username: profiles.username,
        displayName: profiles.displayName,
      })
      .from(follows)
      .innerJoin(profiles, eq(profiles.userId, follows.followerId))
      .where(
        and(
          eq(follows.followingId, ctx.user.id),
          eq(follows.accepted, false),
          unblocked(ctx.user.id, profiles.userId)
        )
      )
      .orderBy(desc(follows.id))
      .limit(100)
  ),
  respondRequest: authedQuery
    .input(z.object({ userId: id, accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireUnblocked(ctx.user.id, input.userId);
      const condition = and(
        eq(follows.followingId, ctx.user.id),
        eq(follows.followerId, input.userId),
        eq(follows.accepted, false)
      );
      if (input.accept)
        await db.update(follows).set({ accepted: true }).where(condition);
      else await db.delete(follows).where(condition);
      return { ok: true };
    }),
  blocked: authedQuery.query(({ ctx }) =>
    getDb()
      .select({ userId: profiles.userId, username: profiles.username })
      .from(blocks)
      .innerJoin(profiles, eq(profiles.userId, blocks.targetId))
      .where(eq(blocks.userId, ctx.user.id))
      .limit(100)
  ),
  block: authedQuery
    .input(z.object({ userId: id, block: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST" });
      const db = getDb();
      await db.transaction(async tx => {
        if (input.block) {
          await tx
            .insert(blocks)
            .values({ userId: ctx.user.id, targetId: input.userId })
            .onDuplicateKeyUpdate({ set: { id: sql`${blocks.id}` } });
          await tx
            .delete(follows)
            .where(
              or(
                and(
                  eq(follows.followerId, ctx.user.id),
                  eq(follows.followingId, input.userId)
                ),
                and(
                  eq(follows.followingId, ctx.user.id),
                  eq(follows.followerId, input.userId)
                )
              )
            );
        } else
          await tx
            .delete(blocks)
            .where(
              and(
                eq(blocks.userId, ctx.user.id),
                eq(blocks.targetId, input.userId)
              )
            );
      });
      return { ok: true };
    }),
  managePost: authedQuery
    .input(
      z.object({
        postId: id,
        action: z.enum(["archive", "unarchive", "restore", "pin", "unpin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().transaction(async tx => {
        if (input.action === "pin")
          await tx
            .select()
            .from(profiles)
            .where(eq(profiles.userId, ctx.user.id))
            .for("update");
        const [post] = await tx
          .select()
          .from(posts)
          .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)))
          .for("update");
        if (!post) throw new TRPCError({ code: "NOT_FOUND" });
        if (post.moderated)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This post was removed by moderation",
          });
        if (post.deletedAt && input.action !== "restore")
          throw new TRPCError({ code: "BAD_REQUEST" });
        if (
          input.action === "restore" &&
          (!post.deletedAt ||
            post.deletedAt.getTime() < Date.now() - 30 * 86400000)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The restore window has expired",
          });
        if (input.action === "pin") {
          const pinned = await tx
            .select()
            .from(posts)
            .where(
              and(
                eq(posts.userId, ctx.user.id),
                isNull(posts.deletedAt),
                eq(posts.archived, false),
                sql`${posts.pinnedAt} IS NOT NULL`
              )
            );
          if (pinned.length >= 3 && !post.pinnedAt)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unpin a post before pinning another",
            });
          if (post.archived)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unarchive this post first",
            });
        }
        await tx
          .update(posts)
          .set(
            input.action === "restore"
              ? { deletedAt: null }
              : input.action === "pin"
                ? { pinnedAt: new Date() }
                : input.action === "unpin"
                  ? { pinnedAt: null }
                  : input.action === "archive"
                    ? { archived: true, pinnedAt: null }
                    : { archived: false }
          )
          .where(and(eq(posts.id, post.id), eq(posts.userId, ctx.user.id)));
      });
      return { ok: true };
    }),
  postLibrary: authedQuery
    .input(z.object({ kind: z.enum(["archive", "deleted"]) }))
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, ctx.user.id),
            input.kind === "archive"
              ? and(isNull(posts.deletedAt), eq(posts.archived, true))
              : gt(posts.deletedAt, new Date(Date.now() - 30 * 86400000))
          )
        )
        .orderBy(desc(posts.id))
        .limit(100);
      return postCards(rows, ctx.user.id);
    }),
  deleteComment: authedQuery
    .input(z.object({ commentId: id }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select({ comment: comments, owner: posts.userId })
        .from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .where(eq(comments.id, input.commentId))
        .limit(1);
      if (
        !row ||
        (row.comment.userId !== ctx.user.id && row.owner !== ctx.user.id)
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      await getDb().delete(comments).where(eq(comments.id, input.commentId));
      return { ok: true };
    }),
  deleteStory: authedQuery
    .input(z.object({ storyId: id }))
    .mutation(async ({ ctx, input }) => {
      const [story] = await getDb()
        .select()
        .from(stories)
        .where(
          and(eq(stories.id, input.storyId), eq(stories.userId, ctx.user.id))
        )
        .limit(1);
      if (!story) throw new TRPCError({ code: "NOT_FOUND" });
      await getDb().transaction(async tx => {
        const { mediaCleanup } = await import("../db/schema");
        await tx
          .insert(mediaCleanup)
          .values({ key: story.imageKey })
          .onDuplicateKeyUpdate({ set: { key: story.imageKey } });
        await tx.delete(stories).where(eq(stories.id, story.id));
      });
      return { ok: true };
    }),
  storyArchive: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(stories)
      .where(eq(stories.userId, ctx.user.id))
      .orderBy(desc(stories.id))
      .limit(100);
    const { urls } = await storage.getPresignedUrls({
      keys: rows.map(x => x.imageKey),
    });
    return rows.map((r, i) => ({
      id: r.id,
      url: urls[i],
      createdAt: r.createdAt,
    }));
  }),
  viewStory: authedQuery
    .input(z.object({ storyId: id }))
    .mutation(async ({ ctx, input }) => {
      const [story] = await getDb()
        .select()
        .from(stories)
        .where(
          and(
            eq(stories.id, input.storyId),
            visibleStory(ctx.user.id),
            or(
              gt(stories.createdAt, since()),
              sql`EXISTS(SELECT 1 FROM highlight_stories hs WHERE hs.storyId=${stories.id})`
            )
          )
        )
        .limit(1);
      if (!story) throw new TRPCError({ code: "NOT_FOUND" });
      if (story.userId !== ctx.user.id)
        await getDb()
          .insert(storyViews)
          .values({ storyId: story.id, userId: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { id: sql`${storyViews.id}` } });
      return { ok: true };
    }),
  storyViewers: authedQuery
    .input(z.object({ storyId: id }))
    .query(async ({ ctx, input }) => {
      const [story] = await getDb()
        .select()
        .from(stories)
        .where(
          and(eq(stories.id, input.storyId), eq(stories.userId, ctx.user.id))
        )
        .limit(1);
      if (!story) throw new TRPCError({ code: "NOT_FOUND" });
      return getDb()
        .select({
          username: profiles.username,
          createdAt: storyViews.createdAt,
        })
        .from(storyViews)
        .innerJoin(profiles, eq(profiles.userId, storyViews.userId))
        .where(
          and(
            eq(storyViews.storyId, story.id),
            unblocked(ctx.user.id, profiles.userId)
          )
        )
        .limit(100);
    }),
  createHighlight: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(1).max(40),
        storyIds: z.array(id).min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.storyIds)];
      return getDb().transaction(async tx => {
        const owned = await tx
          .select()
          .from(stories)
          .where(
            and(inArray(stories.id, ids), eq(stories.userId, ctx.user.id))
          );
        if (owned.length !== ids.length)
          throw new TRPCError({ code: "FORBIDDEN" });
        const [row] = await tx
          .insert(highlights)
          .values({ userId: ctx.user.id, title: input.title });
        await tx
          .insert(highlightStories)
          .values(ids.map(storyId => ({ highlightId: row.insertId, storyId })));
        return { ok: true };
      });
    }),
  highlights: authedQuery
    .input(z.object({ userId: id }))
    .query(async ({ ctx, input }) => {
      const [access] = await getDb()
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.userId, input.userId),
            visibleAuthor(ctx.user.id, profiles.userId)
          )
        )
        .limit(1);
      if (!access) return [];
      const rows = await getDb()
        .select({ highlight: highlights, story: stories })
        .from(highlights)
        .innerJoin(
          highlightStories,
          eq(highlightStories.highlightId, highlights.id)
        )
        .innerJoin(stories, eq(stories.id, highlightStories.storyId))
        .where(
          and(eq(highlights.userId, input.userId), visibleStory(ctx.user.id))
        )
        .orderBy(desc(highlights.id), stories.id)
        .limit(200);
      const { urls } = await storage.getPresignedUrls({
        keys: rows.map(r => r.story.imageKey),
      });
      return rows.map((r, i) => ({
        highlightId: r.highlight.id,
        title: r.highlight.title,
        storyId: r.story.id,
        contentType: r.story.contentType,
        url: urls[i],
      }));
    }),
  deleteHighlight: authedQuery
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(highlights)
        .where(
          and(eq(highlights.id, input.id), eq(highlights.userId, ctx.user.id))
        );
      return { ok: true };
    }),
  inbox: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: notifications.id,
        kind: notifications.kind,
        postId: notifications.postId,
        storyId: notifications.storyId,
        threadId: notifications.threadId,
        username: profiles.username,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .innerJoin(profiles, eq(profiles.userId, notifications.actorId))
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          unblocked(ctx.user.id, notifications.actorId)
        )
      )
      .orderBy(desc(notifications.id))
      .limit(100)
  ),
  readNotifications: authedQuery.mutation(async ({ ctx }) => {
    await getDb()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.userId, ctx.user.id));
    return { ok: true };
  }),
  conversation: authedQuery
    .input(z.object({ userId: id, before: id.optional() }))
    .query(async ({ ctx, input }) => {
      await requireUnblocked(ctx.user.id, input.userId);
      const [peerPrefs] = await getDb()
        .select({ readReceipts: preferences.readReceipts })
        .from(preferences)
        .where(eq(preferences.userId, input.userId))
        .limit(1);
      const rows = await getDb()
        .select()
        .from(messages)
        .where(
          and(
            or(
              and(
                eq(messages.senderId, ctx.user.id),
                eq(messages.recipientId, input.userId)
              ),
              and(
                eq(messages.recipientId, ctx.user.id),
                eq(messages.senderId, input.userId)
              )
            ),
            isNull(messages.deletedAt),
            input.before ? lt(messages.id, input.before) : undefined
          )
        )
        .orderBy(desc(messages.id))
        .limit(50);
      return rows.reverse().map(row => ({
        ...row,
        readAt:
          row.senderId === ctx.user.id && peerPrefs?.readReceipts === false
            ? null
            : row.readAt,
        isMine: row.senderId === ctx.user.id,
      }));
    }),
  sendMessage: authedQuery
    .input(
      z.object({
        userId: id,
        text: z.string().trim().min(1).max(2000),
        replyId: id.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST" });
      await requireUnblocked(ctx.user.id, input.userId);
      const [permission] = await getDb()
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, input.userId),
            eq(follows.followingId, ctx.user.id),
            eq(follows.accepted, true)
          )
        )
        .limit(1);
      const [prefs] = await getDb()
        .select()
        .from(preferences)
        .where(eq(preferences.userId, input.userId));
      const [restricted] = await getDb()
        .select()
        .from(restrictions)
        .where(
          and(
            eq(restrictions.userId, input.userId),
            eq(restrictions.targetId, ctx.user.id)
          )
        );
      if (
        restricted ||
        prefs?.requests === "nobody" ||
        (!permission && prefs?.requests !== "everyone")
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This person must follow you before you can message them",
        });
      if (input.replyId) {
        const [reply] = await getDb()
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.id, input.replyId),
              isNull(messages.deletedAt),
              or(
                and(
                  eq(messages.senderId, ctx.user.id),
                  eq(messages.recipientId, input.userId)
                ),
                and(
                  eq(messages.recipientId, ctx.user.id),
                  eq(messages.senderId, input.userId)
                )
              )
            )
          )
          .limit(1);
        if (!reply)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Reply target is unavailable",
          });
      }
      const [row] = await getDb().insert(messages).values({
        senderId: ctx.user.id,
        recipientId: input.userId,
        text: input.text,
        replyId: input.replyId,
      });
      return { id: row.insertId };
    }),
  conversations: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(messages)
      .where(
        and(
          isNull(messages.deletedAt),
          or(
            eq(messages.senderId, ctx.user.id),
            eq(messages.recipientId, ctx.user.id)
          )
        )
      )
      .orderBy(desc(messages.id))
      .limit(200);
    const ids = [
      ...new Set(
        rows.map(r => (r.senderId === ctx.user.id ? r.recipientId : r.senderId))
      ),
    ];
    if (!ids.length) return [];
    const people = await getDb()
      .select()
      .from(profiles)
      .where(
        and(
          inArray(profiles.userId, ids),
          unblocked(ctx.user.id, profiles.userId)
        )
      );
    return people.map(p => ({
      userId: p.userId,
      username: p.username,
      last: rows.find(
        r => r.senderId === p.userId || r.recipientId === p.userId
      )?.text,
    }));
  }),
  readMessages: authedQuery
    .input(z.object({ userId: id }))
    .mutation(async ({ ctx, input }) => {
      await requireUnblocked(ctx.user.id, input.userId);
      await getDb()
        .update(messages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(messages.recipientId, ctx.user.id),
            eq(messages.senderId, input.userId),
            isNull(messages.readAt)
          )
        );
      return { ok: true };
    }),
  editMessage: authedQuery
    .input(z.object({ id, text: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const [message] = await getDb()
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, input.id),
            eq(messages.senderId, ctx.user.id),
            isNull(messages.deletedAt)
          )
        )
        .limit(1);
      if (!message) throw new TRPCError({ code: "NOT_FOUND" });
      if (Date.now() - message.createdAt.getTime() > 15 * 60 * 1000)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Messages can be edited for 15 minutes",
        });
      await getDb()
        .update(messages)
        .set({ text: input.text, editedAt: new Date() })
        .where(eq(messages.id, input.id));
      return { ok: true };
    }),
  deleteMessage: authedQuery
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(messages)
        .set({ text: "", deletedAt: new Date() })
        .where(
          and(
            eq(messages.id, input.id),
            eq(messages.senderId, ctx.user.id),
            isNull(messages.deletedAt)
          )
        );
      return { ok: true };
    }),
  report: authedQuery
    .input(z.object({ postId: id, reason: z.string().trim().min(5).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await requirePost(input.postId, ctx.user.id);
      await getDb()
        .insert(reports)
        .values({
          userId: ctx.user.id,
          postId: input.postId,
          reason: input.reason,
        })
        .onDuplicateKeyUpdate({ set: { reason: input.reason } });
      return { ok: true };
    }),
  reports: adminQuery.query(() =>
    getDb()
      .select()
      .from(reports)
      .where(eq(reports.status, "open"))
      .orderBy(reports.id)
      .limit(100)
  ),
  reviewReport: adminQuery
    .input(z.object({ id, remove: z.boolean() }))
    .mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        const [report] = await tx
          .select()
          .from(reports)
          .where(eq(reports.id, input.id))
          .for("update");
        if (!report) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.remove)
          await tx
            .update(posts)
            .set({ deletedAt: new Date(), pinnedAt: null, moderated: true })
            .where(eq(posts.id, report.postId));
        await tx
          .update(reports)
          .set({ status: input.remove ? "removed" : "reviewed" })
          .where(eq(reports.id, report.id));
      });
      return { ok: true };
    }),
  insights: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [count] = await db
      .select({ posts: sql<number>`count(*)` })
      .from(posts)
      .where(and(eq(posts.userId, ctx.user.id), isNull(posts.deletedAt)));
    const [engagement] = await db
      .select({ likes: sql<number>`count(*)` })
      .from(likes)
      .innerJoin(posts, eq(posts.id, likes.postId))
      .where(and(eq(posts.userId, ctx.user.id), isNull(posts.deletedAt)));
    return { posts: Number(count.posts), likes: Number(engagement.likes) };
  }),
  exportData: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    return {
      profile: await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, ctx.user.id)),
      posts: await db
        .select({
          id: posts.id,
          caption: posts.caption,
          altText: posts.altText,
          location: posts.location,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(eq(posts.userId, ctx.user.id))
        .limit(10000),
      comments: await db
        .select()
        .from(comments)
        .where(eq(comments.userId, ctx.user.id))
        .limit(10000),
      saved: await db
        .select({ postId: savedPosts.postId })
        .from(savedPosts)
        .where(eq(savedPosts.userId, ctx.user.id))
        .limit(10000),
      generatedAt: new Date(),
    };
  }),
});
