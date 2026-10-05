import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne, sql, inArray, gt, lt, isNull } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { storage } from "./services/storage";
import { getDb } from "./queries/connection";
import {
  profiles,
  posts,
  likes,
  comments,
  follows,
  stories,
  savedPosts,
  notifications,
  postMedia,
  mediaCleanup,
  storyViews,
} from "../db/schema";

import { claimUploads } from "./services/uploads";
import {
  visiblePost,
  visibleAuthor,
  unblocked,
  requirePost,
  requireUnblocked,
} from "./services/access";

/** Batch-resolve storage keys to short-lived render URLs. */
async function resolveUrls(
  keys: (string | null)[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(keys.filter((k): k is string => !!k))];
  const map = new Map<string, string>();
  if (!uniq.length) return map;
  const { urls } = await storage.getPresignedUrls({ keys: uniq });
  uniq.forEach((k, i) => {
    const u = urls[i];
    const str = u;
    if (str) map.set(k, str);
  });
  return map;
}

/** Ensure the signed-in user has a profile; create a default one if missing. */
async function ensureProfile(userId: number, fallbackName: string | null) {
  const db = getDb();
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
  if (existing) return existing;

  const username = `user_${userId}`;
  await db
    .insert(profiles)
    .values({ userId, username, displayName: fallbackName || username })
    .onDuplicateKeyUpdate({ set: { userId: sql`${profiles.userId}` } });
  return db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
}

export async function postCards(
  rows: (typeof posts.$inferSelect)[],
  viewerId: number
) {
  const db = getDb();
  if (!rows.length) return [];
  const postIds = rows.map(p => p.id);
  const authorIds = [...new Set(rows.map(p => p.userId))];

  const authorProfiles = await db
    .select()
    .from(profiles)
    .where(inArray(profiles.userId, authorIds));

  const likeCounts = await db
    .select({ postId: likes.postId, n: sql<number>`count(*)` })
    .from(likes)
    .where(inArray(likes.postId, postIds))
    .groupBy(likes.postId);

  const commentCounts = await db
    .select({ postId: comments.postId, n: sql<number>`count(*)` })
    .from(comments)
    .where(inArray(comments.postId, postIds))
    .groupBy(comments.postId);

  const myLikes = await db
    .select({ postId: likes.postId })
    .from(likes)
    .where(and(eq(likes.userId, viewerId), inArray(likes.postId, postIds)));

  const mySaved = await db
    .select({ postId: savedPosts.postId })
    .from(savedPosts)
    .where(
      and(eq(savedPosts.userId, viewerId), inArray(savedPosts.postId, postIds))
    );

  const mediaRows = await db
    .select()
    .from(postMedia)
    .where(inArray(postMedia.postId, postIds))
    .orderBy(postMedia.position);
  const urlMap = await resolveUrls([
    ...mediaRows.map(m => m.key),
    ...rows.map(p => p.imageKey),
    ...authorProfiles.map(p => p.avatarKey),
  ]);

  const likeMap = new Map(likeCounts.map(r => [r.postId, Number(r.n)]));
  const commentMap = new Map(commentCounts.map(r => [r.postId, Number(r.n)]));
  const likedSet = new Set(myLikes.map(r => r.postId));
  const savedSet = new Set(mySaved.map(r => r.postId));
  const profileMap = new Map(authorProfiles.map(p => [p.userId, p]));

  return rows.map(p => {
    const author = profileMap.get(p.userId);
    return {
      id: p.id,
      caption: p.caption,
      altText: p.altText,
      pinnedAt: p.pinnedAt,
      location: p.location,
      createdAt: p.createdAt,
      imageUrl: urlMap.get(p.imageKey) ?? null,
      kind: p.kind,
      media: mediaRows
        .filter(m => m.postId === p.id)
        .map(m => ({
          url: urlMap.get(m.key) || null,
          contentType: m.contentType,
        })),
      likeCount: likeMap.get(p.id) ?? 0,
      commentCount: commentMap.get(p.id) ?? 0,
      likedByMe: likedSet.has(p.id),
      savedByMe: savedSet.has(p.id),
      isMine: p.userId === viewerId,
      author: {
        userId: p.userId,
        username: author?.username ?? "user",
        displayName: author?.displayName ?? null,
        avatarUrl: author?.avatarKey
          ? (urlMap.get(author.avatarKey) ?? null)
          : null,
      },
    };
  });
}

export const socialRouter = createRouter({
  myProfile: authedQuery.query(async ({ ctx }) => {
    const p = await ensureProfile(ctx.user.id, ctx.user.name);
    const urlMap = await resolveUrls([p!.avatarKey]);
    return {
      ...p!,
      avatarUrl: p!.avatarKey ? (urlMap.get(p!.avatarKey) ?? null) : null,
    };
  }),

  updateProfile: authedQuery
    .input(
      z.object({
        username: z
          .string()
          .min(3)
          .max(30)
          .regex(/^[a-z0-9_.]+$/, "Lowercase letters, numbers, _ and . only")
          .refine(
            v =>
              ![
                "login",
                "settings",
                "explore",
                "saved",
                "messages",
                "notifications",
                "library",
                "admin",
                "api",
                "post",
              ].includes(v),
            "Choose another username"
          ),
        displayName: z.string().max(100).optional(),
        bio: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureProfile(ctx.user.id, ctx.user.name);
      const clash = await db.query.profiles.findFirst({
        where: and(
          eq(profiles.username, input.username),
          ne(profiles.userId, ctx.user.id)
        ),
      });
      if (clash)
        throw new TRPCError({ code: "CONFLICT", message: "Username taken" });
      await db
        .update(profiles)
        .set({
          username: input.username,
          displayName: input.displayName ?? null,
          bio: input.bio ?? null,
        })
        .where(eq(profiles.userId, ctx.user.id));
      return { ok: true };
    }),

  uploadAvatar: authedQuery
    .input(z.object({ uploadId: z.string().length(43) }))
    .mutation(async ({ ctx, input }) => {
      await ensureProfile(ctx.user.id, ctx.user.name);
      await getDb().transaction(async tx => {
        const [media] = await claimUploads(
          tx,
          [input.uploadId],
          ctx.user.id,
          "avatar"
        );
        const [profile] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.userId, ctx.user.id))
          .for("update");
        if (profile.avatarKey)
          await tx
            .insert(mediaCleanup)
            .values({ key: profile.avatarKey })
            .onDuplicateKeyUpdate({ set: { key: profile.avatarKey } });
        await tx
          .update(profiles)
          .set({ avatarKey: media.key })
          .where(eq(profiles.userId, ctx.user.id));
      });
      return { ok: true };
    }),
  createPost: authedQuery
    .input(
      z.object({
        uploadIds: z.array(z.string().length(43)).min(1).max(10),
        caption: z.string().max(2200).optional(),
        altText: z.string().max(500).optional(),
        location: z.string().max(120).optional(),
        kind: z.enum(["post", "reel"]).default("post"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureProfile(ctx.user.id, ctx.user.name);
      return getDb().transaction(async tx => {
        const media = await claimUploads(
          tx,
          input.uploadIds,
          ctx.user.id,
          "post"
        );
        if (
          input.kind === "reel" &&
          (media.length !== 1 || media[0].contentType !== "video/mp4")
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A Reel must contain one video",
          });
        const [row] = await tx.insert(posts).values({
          userId: ctx.user.id,
          imageKey: media[0].key,
          caption: input.caption || null,
          altText: input.altText || null,
          location: input.location || null,
          kind: input.kind,
        });
        await tx.insert(postMedia).values(
          media.map((m, position) => ({
            postId: row.insertId,
            key: m.key,
            contentType: m.contentType,
            position,
          }))
        );
        return { ok: true, id: row.insertId };
      });
    }),

  deletePost: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const post = await db.query.posts.findFirst({
        where: eq(posts.id, input.postId),
      });
      if (!post || post.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (post.moderated) throw new TRPCError({ code: "FORBIDDEN" });
      await db
        .update(posts)
        .set({ deletedAt: new Date(), pinnedAt: null })
        .where(
          and(
            eq(posts.id, input.postId),
            isNull(posts.deletedAt),
            eq(posts.moderated, false)
          )
        );
      return { ok: true };
    }),

  feed: authedQuery
    .input(
      z.object({
        limit: z.number().int().positive().max(50).default(30),
        before: z.number().int().positive().optional(),
        mode: z.enum(["all", "following", "reels"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(posts)
        .where(
          and(
            visiblePost(ctx.user.id),
            input.before ? lt(posts.id, input.before) : undefined,
            input.mode === "reels" ? eq(posts.kind, "reel") : undefined,
            input.mode === "following"
              ? sql`(${posts.userId}=${ctx.user.id} OR EXISTS (SELECT 1 FROM follows f_feed WHERE f_feed.followerId=${ctx.user.id} AND f_feed.followingId=${posts.userId} AND f_feed.accepted=1))`
              : undefined
          )
        )
        .orderBy(desc(posts.id))
        .limit(input.limit);
      return postCards(rows, ctx.user.id);
    }),

  explore: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(posts)
      .where(visiblePost(ctx.user.id))
      .orderBy(desc(posts.id))
      .limit(60);
    return postCards(rows, ctx.user.id);
  }),

  userPosts: authedQuery
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const prof = await db.query.profiles.findFirst({
        where: eq(profiles.username, input.username),
      });
      if (!prof)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      await requireUnblocked(ctx.user.id, prof.userId);
      const rows = await db
        .select()
        .from(posts)
        .where(and(eq(posts.userId, prof.userId), visiblePost(ctx.user.id)))
        .orderBy(desc(posts.pinnedAt), desc(posts.id))
        .limit(100);
      return postCards(rows, ctx.user.id);
    }),

  profile: authedQuery
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const prof = await db.query.profiles.findFirst({
        where: eq(profiles.username, input.username),
      });
      if (!prof)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      await requireUnblocked(ctx.user.id, prof.userId);
      const [postCount] = await db
        .select({ n: sql<number>`count(*)` })
        .from(posts)
        .where(
          and(
            eq(posts.userId, prof.userId),
            isNull(posts.deletedAt),
            eq(posts.archived, false)
          )
        );
      const [followerCount] = await db
        .select({ n: sql<number>`count(*)` })
        .from(follows)
        .where(
          and(eq(follows.followingId, prof.userId), eq(follows.accepted, true))
        );
      const [followingCount] = await db
        .select({ n: sql<number>`count(*)` })
        .from(follows)
        .where(
          and(eq(follows.followerId, prof.userId), eq(follows.accepted, true))
        );
      const isFollowing = await db.query.follows.findFirst({
        where: and(
          eq(follows.followerId, ctx.user.id),
          eq(follows.followingId, prof.userId)
        ),
      });
      const urlMap = await resolveUrls([prof.avatarKey]);
      return {
        ...prof,
        avatarUrl: prof.avatarKey ? (urlMap.get(prof.avatarKey) ?? null) : null,
        postCount: Number(postCount.n),
        followerCount: Number(followerCount.n),
        followingCount: Number(followingCount.n),
        isFollowing: !!isFollowing?.accepted,
        requested: !!isFollowing && !isFollowing.accepted,
        isMe: prof.userId === ctx.user.id,
      };
    }),

  follow: authedQuery
    .input(
      z.object({ userId: z.number().int().positive(), follow: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot follow yourself",
        });
      }
      await requireUnblocked(ctx.user.id, input.userId);
      const target = await db.query.profiles.findFirst({
        where: eq(profiles.userId, input.userId),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.follow) {
        await db.transaction(async tx => {
          const [insert] = await tx.insert(follows).ignore().values({
            followerId: ctx.user.id,
            followingId: input.userId,
            accepted: !target.isPrivate,
          });
          if (insert.affectedRows === 1)
            await tx.insert(notifications).values({
              userId: input.userId,
              actorId: ctx.user.id,
              kind: target.isPrivate ? "request" : "follow",
            });
        });
      } else
        await db
          .delete(follows)
          .where(
            and(
              eq(follows.followerId, ctx.user.id),
              eq(follows.followingId, input.userId)
            )
          );
      return { ok: true };
    }),

  suggestions: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(profiles)
      .where(
        and(
          ne(profiles.userId, ctx.user.id),
          unblocked(ctx.user.id, profiles.userId)
        )
      )
      .orderBy(desc(profiles.createdAt))
      .limit(8);
    const myFollows = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(
        and(eq(follows.followerId, ctx.user.id), eq(follows.accepted, true))
      );
    const followingSet = new Set(myFollows.map(f => f.id));
    const urlMap = await resolveUrls(rows.map(r => r.avatarKey));
    return rows.map(r => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarKey ? (urlMap.get(r.avatarKey) ?? null) : null,
      isFollowing: followingSet.has(r.userId),
    }));
  }),

  like: authedQuery
    .input(z.object({ postId: z.number().int().positive(), like: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const post = await requirePost(input.postId, ctx.user.id);
      if (input.like)
        await db.transaction(async tx => {
          const [insert] = await tx
            .insert(likes)
            .ignore()
            .values({ userId: ctx.user.id, postId: input.postId });
          if (insert.affectedRows === 1 && post.userId !== ctx.user.id)
            await tx.insert(notifications).values({
              userId: post.userId,
              actorId: ctx.user.id,
              kind: "like",
              postId: post.id,
            });
        });
      else
        await db
          .delete(likes)
          .where(
            and(eq(likes.userId, ctx.user.id), eq(likes.postId, input.postId))
          );
      return { ok: true };
    }),

  save: authedQuery
    .input(z.object({ postId: z.number().int().positive(), save: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requirePost(input.postId, ctx.user.id);
      if (input.save)
        await db
          .insert(savedPosts)
          .values({ userId: ctx.user.id, postId: input.postId })
          .onDuplicateKeyUpdate({ set: { id: sql`${savedPosts.id}` } });
      else
        await db
          .delete(savedPosts)
          .where(
            and(
              eq(savedPosts.userId, ctx.user.id),
              eq(savedPosts.postId, input.postId)
            )
          );
      return { ok: true };
    }),

  saved: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({ post: posts })
      .from(savedPosts)
      .innerJoin(posts, eq(savedPosts.postId, posts.id))
      .where(and(eq(savedPosts.userId, ctx.user.id), visiblePost(ctx.user.id)))
      .orderBy(desc(savedPosts.createdAt))
      .limit(100);
    return postCards(
      rows.map(r => r.post),
      ctx.user.id
    );
  }),

  addComment: authedQuery
    .input(
      z.object({
        postId: z.number().int().positive(),
        text: z.string().trim().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const post = await requirePost(input.postId, ctx.user.id);
      await getDb().insert(comments).values({
        userId: ctx.user.id,
        postId: input.postId,
        text: input.text,
      });
      if (post.userId !== ctx.user.id)
        await getDb().insert(notifications).values({
          userId: post.userId,
          actorId: ctx.user.id,
          kind: "comment",
          postId: post.id,
        });
      return { ok: true };
    }),

  comments: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requirePost(input.postId, ctx.user.id);
      const db = getDb();
      const rows = await db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.postId, input.postId),
            unblocked(ctx.user.id, comments.userId)
          )
        )
        .orderBy(comments.createdAt)
        .limit(100);
      const authorIds = [...new Set(rows.map(c => c.userId))];
      const authorProfiles = authorIds.length
        ? await db
            .select()
            .from(profiles)
            .where(inArray(profiles.userId, authorIds))
        : [];
      const profileMap = new Map(authorProfiles.map(p => [p.userId, p]));
      const urlMap = await resolveUrls(authorProfiles.map(p => p.avatarKey));
      return rows.map(c => {
        const author = profileMap.get(c.userId);
        return {
          id: c.id,
          isMine: c.userId === ctx.user.id,
          text: c.text,
          createdAt: c.createdAt,
          username: author?.username ?? "user",
          avatarUrl: author?.avatarKey
            ? (urlMap.get(author.avatarKey) ?? null)
            : null,
        };
      });
    }),

  stories: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(stories)
      .where(
        and(
          gt(stories.createdAt, since),
          visibleAuthor(ctx.user.id, stories.userId)
        )
      )
      .orderBy(desc(stories.createdAt))
      .limit(100);
    const authorIds = [...new Set(rows.map(s => s.userId))];
    const authorProfiles = authorIds.length
      ? await db
          .select()
          .from(profiles)
          .where(inArray(profiles.userId, authorIds))
      : [];
    const profileMap = new Map(authorProfiles.map(p => [p.userId, p]));
    const urlMap = await resolveUrls([
      ...rows.map(s => s.imageKey),
      ...authorProfiles.map(p => p.avatarKey),
    ]);
    const viewed = rows.length
      ? await db
          .select({ storyId: storyViews.storyId })
          .from(storyViews)
          .where(
            and(
              eq(storyViews.userId, ctx.user.id),
              inArray(
                storyViews.storyId,
                rows.map(s => s.id)
              )
            )
          )
      : [];
    const viewedIds = new Set(viewed.map(v => v.storyId));
    // Group by user, one entry per user with all their stories
    const byUser = new Map<
      number,
      {
        userId: number;
        username: string;
        avatarUrl: string | null;
        items: {
          id: number;
          url: string | null;
          createdAt: Date;
          viewed: boolean;
        }[];
      }
    >();
    for (const s of rows) {
      const prof = profileMap.get(s.userId);
      if (!byUser.has(s.userId)) {
        byUser.set(s.userId, {
          userId: s.userId,
          username: prof?.username ?? "user",
          avatarUrl: prof?.avatarKey
            ? (urlMap.get(prof.avatarKey) ?? null)
            : null,
          items: [],
        });
      }
      byUser.get(s.userId)!.items.push({
        id: s.id,
        viewed: viewedIds.has(s.id) || s.userId === ctx.user.id,
        url: urlMap.get(s.imageKey) ?? null,
        createdAt: s.createdAt,
      });
    }
    return [...byUser.values()];
  }),

  addStory: authedQuery
    .input(z.object({ uploadId: z.string().length(43) }))
    .mutation(async ({ ctx, input }) => {
      await ensureProfile(ctx.user.id, ctx.user.name);
      await getDb().transaction(async tx => {
        const [media] = await claimUploads(
          tx,
          [input.uploadId],
          ctx.user.id,
          "story"
        );
        await tx
          .insert(stories)
          .values({ userId: ctx.user.id, imageKey: media.key });
      });
      return { ok: true };
    }),

  searchUsers: authedQuery
    .input(z.object({ q: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(profiles)
        .where(
          and(
            unblocked(ctx.user.id, profiles.userId),
            sql`lower(${profiles.username}) like ${"%" + input.q.toLowerCase().replace(/[\\%_]/g, "") + "%"}`
          )
        )
        .limit(10);
      const urlMap = await resolveUrls(rows.map(r => r.avatarKey));
      return rows.map(r => ({
        userId: r.userId,
        username: r.username,
        displayName: r.displayName,
        avatarUrl: r.avatarKey ? (urlMap.get(r.avatarKey) ?? null) : null,
      }));
    }),

  post: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const post = await requirePost(input.postId, ctx.user.id);
      return (await postCards([post], ctx.user.id))[0];
    }),
});
