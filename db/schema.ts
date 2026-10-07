import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
  int,
  json,
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
    parentId: bigint("parentId", { mode: "number", unsigned: true }),
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
    contentType: varchar("contentType", { length: 40 })
      .default("image/webp")
      .notNull(),
    closeFriends: boolean("closeFriends").default(false).notNull(),
    caption: varchar("caption", { length: 500 }),
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
    kind: mysqlEnum("kind", [
      "like",
      "comment",
      "follow",
      "request",
      "mention",
      "group_mention",
      "group_message",
    ]).notNull(),
    postId: bigint("postId", { mode: "number", unsigned: true }).references(
      () => posts.id,
      { onDelete: "cascade" }
    ),
    storyId: bigint("storyId", { mode: "number", unsigned: true }).references(
      () => stories.id,
      { onDelete: "cascade" }
    ),
    threadId: bigint("threadId", { mode: "number", unsigned: true }),
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
    replyId: bigint("replyId", { mode: "number", unsigned: true }),
    editedAt: timestamp("editedAt"),
    deletedAt: timestamp("deletedAt"),
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
    purpose: mysqlEnum("purpose", [
      "post",
      "avatar",
      "story",
      "chat",
      "instant",
    ]).notNull(),
    contentType: varchar("contentType", { length: 40 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [index("upload_expiry").on(t.expiresAt)]
);

// Social graph and private content surfaces.
export const restrictions = mysqlTable(
  "restrictions",
  { id: id(), userId: userRef(), targetId: userRef("targetId") },
  t => [uniqueIndex("restriction_pair").on(t.userId, t.targetId)]
);
export const closeFriends = mysqlTable(
  "close_friends",
  { id: id(), userId: userRef(), targetId: userRef("targetId") },
  t => [uniqueIndex("close_friend_pair").on(t.userId, t.targetId)]
);
export const commentLikes = mysqlTable(
  "comment_likes",
  {
    id: id(),
    userId: userRef(),
    commentId: bigint("commentId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
  },
  t => [uniqueIndex("comment_like_pair").on(t.userId, t.commentId)]
);
export const reposts = mysqlTable(
  "reposts",
  { id: id(), userId: userRef(), postId: postRef(), createdAt: created() },
  t => [
    uniqueIndex("repost_pair").on(t.userId, t.postId),
    index("repost_post").on(t.postId),
  ]
);
export const collections = mysqlTable("collections", {
  id: id(),
  userId: userRef(),
  name: varchar("name", { length: 60 }).notNull(),
  createdAt: created(),
});
export const collectionPosts = mysqlTable(
  "collection_posts",
  {
    id: id(),
    collectionId: bigint("collectionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    postId: postRef(),
  },
  t => [uniqueIndex("collection_post_pair").on(t.collectionId, t.postId)]
);
export const postTags = mysqlTable(
  "post_tags",
  {
    id: id(),
    postId: postRef(),
    tag: varchar("tag", { length: 50 }).notNull(),
  },
  t => [
    uniqueIndex("post_tag_pair").on(t.postId, t.tag),
    index("hashtag_search").on(t.tag, t.postId),
  ]
);
export const postLocations = mysqlTable("post_locations", {
  postId: postRef().primaryKey(),
  latitude: int("latitude").notNull(),
  longitude: int("longitude").notNull(),
});
export const notes = mysqlTable(
  "notes",
  {
    id: id(),
    userId: userRef().unique(),
    text: varchar("text", { length: 60 }).notNull(),
    closeFriends: boolean("closeFriends").notNull().default(false),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [index("notes_expiry").on(t.expiresAt)]
);
export const storyReactions = mysqlTable(
  "story_reactions",
  {
    id: id(),
    userId: userRef(),
    storyId: bigint("storyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    reaction: varchar("reaction", { length: 16 }).notNull(),
    reply: varchar("reply", { length: 500 }),
    createdAt: created(),
  },
  t => [uniqueIndex("story_reaction_pair").on(t.userId, t.storyId)]
);
export const instants = mysqlTable(
  "instants",
  {
    id: id(),
    userId: userRef(),
    key: varchar("key", { length: 512 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: created(),
  },
  t => [index("instant_expiry").on(t.expiresAt)]
);
export const instantRecipients = mysqlTable(
  "instant_recipients",
  {
    id: id(),
    instantId: bigint("instantId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => instants.id, { onDelete: "cascade" }),
    userId: userRef(),
    openedAt: timestamp("openedAt"),
  },
  t => [uniqueIndex("instant_recipient").on(t.instantId, t.userId)]
);
export const preferences = mysqlTable("preferences", {
  userId: userRef().primaryKey(),
  theme: mysqlEnum("theme", ["system", "light", "dark"])
    .notNull()
    .default("system"),
  language: mysqlEnum("language", ["en", "fr", "yo"]).notNull().default("en"),
  requests: mysqlEnum("requests", ["followers", "everyone", "nobody"])
    .notNull()
    .default("followers"),
  groupInvites: mysqlEnum("groupInvites", ["followers", "everyone", "nobody"])
    .notNull()
    .default("followers"),
  mentions: mysqlEnum("mentions", ["followers", "everyone", "nobody"])
    .notNull()
    .default("followers"),
  readReceipts: boolean("readReceipts").notNull().default(true),
  activityStatus: boolean("activityStatus").notNull().default(true),
});
export const drafts = mysqlTable("drafts", {
  id: id(),
  userId: userRef(),
  caption: text("caption").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
// Group chat uses durable membership, explicit requests and bounded history.
export const chatThreads = mysqlTable("chat_threads", {
  id: id(),
  ownerId: userRef("ownerId"),
  title: varchar("title", { length: 80 }).notNull(),
  kind: mysqlEnum("kind", ["group", "broadcast"]).notNull(),
  handle: varchar("handle", { length: 40 }).unique(),
  description: varchar("description", { length: 240 }),
  inviteHash: varchar("inviteHash", { length: 64 }).unique(),
  inviteExpiresAt: timestamp("inviteExpiresAt"),
  createdAt: created(),
});
export const chatMembers = mysqlTable(
  "chat_members",
  {
    id: id(),
    threadId: bigint("threadId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    userId: userRef(),
    accepted: boolean("accepted").notNull().default(false),
    memberTag: varchar("memberTag", { length: 32 }),
    notifications: mysqlEnum("notifications", ["all", "mentions", "muted"])
      .notNull()
      .default("all"),
    lastReadId: bigint("lastReadId", { mode: "number", unsigned: true })
      .notNull()
      .default(0),
    historyAfterId: bigint("historyAfterId", { mode: "number", unsigned: true })
      .notNull()
      .default(0),
    joinedAt: created(),
  },
  t => [
    uniqueIndex("chat_member_pair").on(t.threadId, t.userId),
    index("chat_member_inbox").on(t.userId, t.threadId),
  ]
);
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: id(),
    threadId: bigint("threadId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    senderId: userRef("senderId"),
    text: varchar("text", { length: 2000 }).notNull(),
    attachmentKey: varchar("attachmentKey", { length: 512 }),
    contentType: varchar("contentType", { length: 40 }),
    replyId: bigint("replyId", { mode: "number", unsigned: true }),
    pinned: boolean("pinned").notNull().default(false),
    editedAt: timestamp("editedAt"),
    deletedAt: timestamp("deletedAt"),
    deliverAt: timestamp("deliverAt").notNull().defaultNow(),
    createdAt: created(),
  },
  t => [
    index("chat_history").on(t.threadId, t.deliverAt, t.id),
    index("chat_history_cursor").on(t.threadId, t.id),
    index("chat_pins").on(t.threadId, t.pinned, t.id),
  ]
);
export const chatReactions = mysqlTable(
  "chat_reactions",
  {
    id: id(),
    messageId: bigint("messageId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: userRef(),
    reaction: varchar("reaction", { length: 16 }).notNull(),
  },
  t => [uniqueIndex("chat_reaction_pair").on(t.messageId, t.userId)]
);
// Financial records intentionally do not cascade when an account is deleted.
const retainedUser = () =>
  bigint("userId", { mode: "number", unsigned: true }).references(
    () => users.id,
    { onDelete: "restrict" }
  );
export const walletAccounts = mysqlTable("wallet_accounts", {
  id: id(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  userId: retainedUser(),
  currency: mysqlEnum("currency", ["COIN", "NGN"]).notNull(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  allowNegative: boolean("allowNegative").notNull().default(false),
  frozen: boolean("frozen").notNull().default(false),
});
export const walletJournal = mysqlTable("wallet_journal", {
  id: id(),
  reference: varchar("reference", { length: 160 }).notNull().unique(),
  currency: mysqlEnum("currency", ["COIN", "NGN"]).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  createdAt: created(),
});
export const walletEntries = mysqlTable(
  "wallet_entries",
  {
    id: id(),
    journalId: bigint("journalId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => walletJournal.id, { onDelete: "restrict" }),
    accountId: bigint("accountId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => walletAccounts.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
  },
  t => [
    uniqueIndex("journal_account").on(t.journalId, t.accountId),
    index("wallet_history").on(t.accountId, t.id),
  ]
);
export const walletVerification = mysqlTable("wallet_verification", {
  userId: userRef().primaryKey(),
  verifiedAt: timestamp("verifiedAt"),
  verificationReference: varchar("verificationReference", {
    length: 120,
  }).unique(),
  recipientCode: varchar("recipientCode", { length: 100 }),
  recipientLabel: varchar("recipientLabel", { length: 100 }),
  pinHash: varchar("pinHash", { length: 200 }),
});
export const rewardCampaigns = mysqlTable("reward_campaigns", {
  id: id(),
  title: varchar("title", { length: 80 }).notNull(),
  task: mysqlEnum("task", ["signup", "profile", "first_post"]).notNull(),
  amount: int("amount").notNull(),
  remaining: bigint("remaining", { mode: "number" }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: created(),
});
export const cashFunding = mysqlTable("cash_funding", {
  reference: varchar("reference", { length: 80 }).primaryKey(),
  amount: int("amount").notNull(),
  userId: retainedUser(),
  settledAt: timestamp("settledAt"),
  createdAt: created(),
});
export const withdrawals = mysqlTable(
  "withdrawals",
  {
    id: id(),
    userId: retainedUser().notNull(),
    reference: varchar("reference", { length: 80 }).notNull().unique(),
    requestKey: varchar("requestKey", { length: 80 }).notNull(),
    amount: int("amount").notNull(),
    recipientCode: varchar("recipientCode", { length: 100 }).notNull(),
    status: mysqlEnum("status", ["reserved", "submitted", "paid", "failed"])
      .notNull()
      .default("reserved"),
    createdAt: created(),
  },
  t => [uniqueIndex("withdrawal_user_request").on(t.userId, t.requestKey)]
);
export const securityEvents = mysqlTable(
  "security_events",
  {
    id: id(),
    userId: retainedUser(),
    event: varchar("event", { length: 80 }).notNull(),
    details: json("details").$type<Record<string, string | number | boolean>>(),
    createdAt: created(),
  },
  t => [index("security_event_date").on(t.createdAt, t.id)]
);
export const gifts = mysqlTable("gifts", {
  id: id(),
  userId: retainedUser().notNull(),
  creatorId: bigint("creatorId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  postId: bigint("postId", { mode: "number", unsigned: true }),
  amount: int("amount").notNull(),
  reference: varchar("reference", { length: 160 }).notNull().unique(),
  createdAt: created(),
});
export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: id(),
    userId: retainedUser().notNull(),
    creatorId: bigint("creatorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [uniqueIndex("subscriber_pair").on(t.userId, t.creatorId)]
);

export const chatReceipts = mysqlTable(
  "chat_receipts",
  {
    id: id(),
    messageId: bigint("messageId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: userRef(),
    readAt: created(),
  },
  t => [uniqueIndex("chat_receipt_pair").on(t.messageId, t.userId)]
);
