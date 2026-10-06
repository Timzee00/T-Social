import { and, eq, sql, isNull } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { posts, profiles, stories, comments } from "../../db/schema";
import { getDb } from "../queries/connection";
export function unblocked(viewer: number, author: AnyMySqlColumn | number) {
  return sql`NOT EXISTS (SELECT 1 FROM blocks b_access WHERE (b_access.userId=${viewer} AND b_access.targetId=${author}) OR (b_access.targetId=${viewer} AND b_access.userId=${author}))`;
}
export function visibleAuthor(viewer: number, author: AnyMySqlColumn | number) {
  return and(
    unblocked(viewer, author),
    sql`(${author}=${viewer} OR EXISTS (SELECT 1 FROM profiles p_access WHERE p_access.userId=${author} AND (p_access.isPrivate=0 OR EXISTS (SELECT 1 FROM follows f_access WHERE f_access.followerId=${viewer} AND f_access.followingId=${author} AND f_access.accepted=1))))`
  )!;
}
export function visiblePost(viewer: number) {
  return and(
    isNull(posts.deletedAt),
    eq(posts.archived, false),
    eq(posts.moderated, false),
    visibleAuthor(viewer, posts.userId)
  );
}
export async function requirePost(postId: number, viewer: number) {
  const [row] = await getDb()
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), visiblePost(viewer)))
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Post is unavailable" });
  return row;
}
export async function requireUnblocked(viewer: number, other: number) {
  const [row] = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.userId, other), unblocked(viewer, other)))
    .limit(1);
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Account is unavailable",
    });
}

export function closeAudience(
  viewer: number,
  author: AnyMySqlColumn | number,
  flag: AnyMySqlColumn
) {
  return sql`(${flag}=0 OR ${author}=${viewer} OR EXISTS(SELECT 1 FROM close_friends cf_access WHERE cf_access.userId=${author} AND cf_access.targetId=${viewer}))`;
}
export function visibleStory(viewer: number) {
  return and(
    visibleAuthor(viewer, stories.userId),
    closeAudience(viewer, stories.userId, stories.closeFriends)
  );
}
export function visibleComment(viewer: number) {
  return and(
    unblocked(viewer, comments.userId),
    sql`(${comments.userId}=${viewer} OR EXISTS(SELECT 1 FROM posts cp WHERE cp.id=${comments.postId} AND (cp.userId=${viewer} OR NOT EXISTS(SELECT 1 FROM restrictions cr WHERE cr.userId=cp.userId AND cr.targetId=${comments.userId}))))`
  );
}
export async function requireStory(id: number, viewer: number) {
  const [row] = await getDb()
    .select()
    .from(stories)
    .where(
      and(
        eq(stories.id, id),
        visibleStory(viewer),
        sql`${stories.createdAt} > ${new Date(Date.now() - 86400000)}`
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Story is unavailable" });
  return row;
}
