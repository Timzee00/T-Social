import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
  int,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
const id = () =>
  bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();
const userRef = (name = "userId") =>
  bigint(name, { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const created = () =>
  timestamp("createdAt", { mode: "date" }).defaultNow().notNull();
export const users = mysqlTable("users", {
  id: id(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: created(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export const profiles = mysqlTable("profiles", {
  id: id(),
  userId: userRef().unique(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  displayName: varchar("displayName", { length: 100 }),
  bio: text("bio"),
  avatarKey: text("avatarKey"),
  isPrivate: boolean("isPrivate").notNull().default(false),
  createdAt: created(),
});
export type Profile = typeof profiles.$inferSelect;
export const posts = mysqlTable(
  "posts",
  {
    id: id(),
    userId: userRef(),
    imageKey: text("imageKey").notNull(),
    caption: text("caption"),
    altText: varchar("altText", { length: 500 }),
    kind: mysqlEnum("kind", ["post", "reel"]).notNull().default("post"),
    location: varchar("location", { length: 120 }),
    archived: boolean("archived").notNull().default(false),
    deletedAt: timestamp("deletedAt"),
    moderated: boolean("moderated").notNull().default(false),
    pinnedAt: timestamp("pinnedAt"),
    createdAt: created(),
  },
  t => [
    index("posts_author_date").on(t.userId, t.createdAt, t.id),
    index("posts_feed").on(t.deletedAt, t.archived, t.id),
  ]
);
export type Post = typeof posts.$inferSelect;
const postRef = () =>
  bigint("postId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" });
export const likes = mysqlTable(
  "likes",
  { id: id(), userId: userRef(), postId: postRef(), createdAt: created() },
  t => [
    uniqueIndex("like_user_post").on(t.userId, t.postId),
    index("likes_post").on(t.postId),
  ]
);
export const comments = mysqlTable(
  "comments",
  {
    id: id(),
    userId: userRef(),
    postId: postRef(),
    text: text("text").notNull(),
    createdAt: created(),
  },
  t => [index("comments_post").on(t.postId, t.id)]
);
export type Comment = typeof comments.$inferSelect;
export const follows = mysqlTable(
  "follows",
  {
    id: id(),
    followerId: userRef("followerId"),
    followingId: userRef("followingId"),
    accepted: boolean("accepted").notNull().default(true),
    createdAt: created(),
  },
  t => [
    uniqueIndex("follow_pair").on(t.followerId, t.followingId),
    index("followers").on(t.followingId, t.accepted),
  ]
);
export const blocks = mysqlTable(
  "blocks",
  {
    id: id(),
    userId: userRef(),
    targetId: userRef("targetId"),
    createdAt: created(),
  },
  t => [uniqueIndex("block_pair").on(t.userId, t.targetId)]
);
export const stories = mysqlTable(
  "stories",
  {
    id: id(),
    userId: userRef(),
    imageKey: text("imageKey").notNull(),
    createdAt: created(),
  },
  t => [index("stories_created").on(t.createdAt)]
);
export const storyViews = mysqlTable(
  "story_views",
  {
    id: id(),
    userId: userRef(),
    storyId: bigint("storyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  t => [uniqueIndex("story_view").on(t.storyId, t.userId)]
);
export const highlights = mysqlTable("highlights", {
  id: id(),
  userId: userRef(),
  title: varchar("title", { length: 40 }).notNull(),
  createdAt: created(),
});
export const highlightStories = mysqlTable(
  "highlight_stories",
  {
    id: id(),
    highlightId: bigint("highlightId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => highlights.id, { onDelete: "cascade" }),
    storyId: bigint("storyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
  },
  t => [uniqueIndex("highlight_story").on(t.highlightId, t.storyId)]
);
export const savedPosts = mysqlTable(
  "saved_posts",
  { id: id(), userId: userRef(), postId: postRef(), createdAt: created() },
  t => [uniqueIndex("save_user_post").on(t.userId, t.postId)]
);
export const authIdentities = mysqlTable(
  "auth_identities",
  {
    id: id(),
    userId: userRef(),
    provider: varchar("provider", { length: 20 }).notNull(),
    subjectHash: varchar("subjectHash", { length: 64 }).notNull(),
    createdAt: created(),
  },
  t => [uniqueIndex("external_identity").on(t.provider, t.subjectHash)]
);
export const sessions = mysqlTable(
  "sessions",
  {
    id: id(),
    userId: userRef(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    agent: varchar("agent", { length: 250 }).notNull(),
    createdAt: created(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [
    index("sessions_user").on(t.userId),
    index("sessions_expiry").on(t.expiresAt),
  ]
);
export const authTransactions = mysqlTable(
  "auth_transactions",
  {
    tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 20 }).notNull(),
    bindingHash: varchar("bindingHash", { length: 64 }).notNull(),
    verifier: varchar("verifier", { length: 128 }).notNull(),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    linkUserId: bigint("linkUserId", {
      mode: "number",
      unsigned: true,
    }).references(() => users.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 20 }),
    attempts: int("attempts").notNull().default(0),
    consumedAt: timestamp("consumedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [index("auth_expiry").on(t.expiresAt)]
);
export const rateLimits = mysqlTable(
  "rate_limits",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    hits: int("hits").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [index("rate_expiry").on(t.expiresAt)]
);
export const notifications = mysqlTable(
  "notifications",
  {
    id: id(),
    userId: userRef(),
    actorId: userRef("actorId"),
    kind: mysqlEnum("kind", ["like", "comment", "follow", "request"]).notNull(),
    postId: bigint("postId", { mode: "number", unsigned: true }).references(
      () => posts.id,
      { onDelete: "cascade" }
    ),
    readAt: timestamp("readAt"),
    createdAt: created(),
  },
  t => [index("notification_inbox").on(t.userId, t.id)]
);
export const messages = mysqlTable(
  "messages",
  {
    id: id(),
    senderId: userRef("senderId"),
    recipientId: userRef("recipientId"),
    text: text("text").notNull(),
    readAt: timestamp("readAt"),
    createdAt: created(),
  },
  t => [
    index("message_sender").on(t.senderId, t.recipientId, t.id),
    index("message_recipient").on(t.recipientId, t.senderId, t.id),
  ]
);
export const reports = mysqlTable(
  "reports",
  {
    id: id(),
    userId: userRef(),
    postId: postRef(),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: mysqlEnum("status", ["open", "reviewed", "removed"])
      .notNull()
      .default("open"),
    createdAt: created(),
  },
  t => [uniqueIndex("report_user_post").on(t.userId, t.postId)]
);
export const mediaCleanup = mysqlTable("media_cleanup", {
  id: id(),
  key: varchar("key", { length: 512 }).notNull().unique(),
  createdAt: created(),
});

export const postMedia = mysqlTable(
  "post_media",
  {
    id: id(),
    postId: postRef(),
    key: text("key").notNull(),
    contentType: varchar("contentType", { length: 40 }).notNull(),
    position: int("position").notNull(),
  },
  t => [uniqueIndex("post_media_position").on(t.postId, t.position)]
);
export const uploads = mysqlTable(
  "uploads",
  {
    id: varchar("id", { length: 43 }).primaryKey(),
    userId: userRef(),
    key: varchar("key", { length: 512 }).notNull().unique(),
    purpose: mysqlEnum("purpose", ["post", "avatar", "story"]).notNull(),
    contentType: varchar("contentType", { length: 40 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [index("upload_expiry").on(t.expiresAt)]
);
