import { and, eq, inArray, sql } from "drizzle-orm";
import * as s from "../../db/schema";
import { getDb } from "../queries/connection";
import { unblocked } from "./access";

const groupPattern = /@group:([a-z0-9][a-z0-9_-]{0,39})/gi;
const userPattern = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{1,50})/g;

export function mentionedGroups(text: string) {
  return [
    ...new Set(
      [...text.matchAll(groupPattern)].map(match => match[1].toLowerCase())
    ),
  ].slice(0, 10);
}

export function mentionedUsers(text: string) {
  const withoutGroups = text.replace(groupPattern, " ");
  return [
    ...new Set(
      [...withoutGroups.matchAll(userPattern)].map(match =>
        match[2].toLowerCase()
      )
    ),
  ].slice(0, 20);
}

async function mentionAllowed(targetId: number, actorId: number) {
  const [prefs] = await getDb()
    .select({
      mentions: s.preferences.mentions,
    })
    .from(s.preferences)
    .where(eq(s.preferences.userId, targetId))
    .limit(1);
  const mode = prefs?.mentions ?? "followers";
  if (mode === "nobody") return false;
  if (mode === "everyone") return true;
  const [followsActor] = await getDb()
    .select({ id: s.follows.id })
    .from(s.follows)
    .where(
      and(
        eq(s.follows.followerId, targetId),
        eq(s.follows.followingId, actorId),
        eq(s.follows.accepted, true)
      )
    )
    .limit(1);
  return !!followsActor;
}

export async function notifyTextMentions(input: {
  actorId: number;
  text: string;
  storyId?: number;
  threadId?: number;
}) {
  const db = getDb();
  const usernames = mentionedUsers(input.text);
  if (usernames.length) {
    const targets = await db
      .select({ userId: s.profiles.userId, username: s.profiles.username })
      .from(s.profiles)
      .where(
        and(
          inArray(s.profiles.username, usernames),
          unblocked(input.actorId, s.profiles.userId),
          input.threadId
            ? sql`EXISTS(
                SELECT 1 FROM chat_members cm_mention
                WHERE cm_mention.threadId=${input.threadId}
                  AND cm_mention.userId=${s.profiles.userId}
                  AND cm_mention.accepted=1
              )`
            : undefined
        )
      )
      .limit(20);
    const allowed: number[] = [];
    for (const target of targets) {
      if (
        target.userId !== input.actorId &&
        (await mentionAllowed(target.userId, input.actorId))
      )
        allowed.push(target.userId);
    }
    if (allowed.length)
      await db.insert(s.notifications).values(
        allowed.map(userId => ({
          userId,
          actorId: input.actorId,
          kind: "mention" as const,
          storyId: input.storyId,
          threadId: input.threadId,
        }))
      );
  }

  if (!input.storyId) return;
  const handles = mentionedGroups(input.text);
  if (!handles.length) return;

  const groups = await db
    .select({ id: s.chatThreads.id, handle: s.chatThreads.handle })
    .from(s.chatThreads)
    .innerJoin(
      s.chatMembers,
      and(
        eq(s.chatMembers.threadId, s.chatThreads.id),
        eq(s.chatMembers.userId, input.actorId),
        eq(s.chatMembers.accepted, true)
      )
    )
    .where(inArray(s.chatThreads.handle, handles))
    .limit(10);

  for (const group of groups) {
    const members = await db
      .select({
        userId: s.chatMembers.userId,
        notifications: s.chatMembers.notifications,
      })
      .from(s.chatMembers)
      .where(
        and(
          eq(s.chatMembers.threadId, group.id),
          eq(s.chatMembers.accepted, true),
          sql`${s.chatMembers.userId} <> ${input.actorId}`,
          unblocked(input.actorId, s.chatMembers.userId)
        )
      )
      .limit(50);
    const allowed: number[] = [];
    for (const member of members) {
      if (
        member.notifications !== "muted" &&
        (await mentionAllowed(member.userId, input.actorId))
      )
        allowed.push(member.userId);
    }
    if (allowed.length)
      await db.insert(s.notifications).values(
        allowed.map(userId => ({
          userId,
          actorId: input.actorId,
          kind: "group_mention" as const,
          storyId: input.storyId,
          threadId: group.id,
        }))
      );
  }
}
