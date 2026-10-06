CREATE TABLE `cash_funding` (
	`reference` varchar(80) NOT NULL,
	`amount` int NOT NULL,
	`userId` bigint unsigned,
	`settledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_funding_reference` PRIMARY KEY(`reference`)
);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`threadId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`accepted` boolean NOT NULL DEFAULT false,
	`lastReadId` bigint unsigned NOT NULL DEFAULT 0,
	`historyAfterId` bigint unsigned NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_member_pair` UNIQUE(`threadId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`threadId` bigint unsigned NOT NULL,
	`senderId` bigint unsigned NOT NULL,
	`text` varchar(2000) NOT NULL,
	`attachmentKey` varchar(512),
	`contentType` varchar(40),
	`replyId` bigint unsigned,
	`pinned` boolean NOT NULL DEFAULT false,
	`editedAt` timestamp,
	`deletedAt` timestamp,
	`deliverAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_reactions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`messageId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`reaction` varchar(16) NOT NULL,
	CONSTRAINT `chat_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_reaction_pair` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`ownerId` bigint unsigned NOT NULL,
	`title` varchar(80) NOT NULL,
	`kind` enum('group','broadcast') NOT NULL,
	`inviteHash` varchar(64),
	`inviteExpiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_threads_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_threads_inviteHash_unique` UNIQUE(`inviteHash`)
);
--> statement-breakpoint
CREATE TABLE `close_friends` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`targetId` bigint unsigned NOT NULL,
	CONSTRAINT `close_friends_id` PRIMARY KEY(`id`),
	CONSTRAINT `close_friend_pair` UNIQUE(`userId`,`targetId`)
);
--> statement-breakpoint
CREATE TABLE `collection_posts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`collectionId` bigint unsigned NOT NULL,
	`postId` bigint unsigned NOT NULL,
	CONSTRAINT `collection_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `collection_post_pair` UNIQUE(`collectionId`,`postId`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`name` varchar(60) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comment_likes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`commentId` bigint unsigned NOT NULL,
	CONSTRAINT `comment_likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `comment_like_pair` UNIQUE(`userId`,`commentId`)
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`caption` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gifts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`creatorId` bigint unsigned NOT NULL,
	`postId` bigint unsigned,
	`amount` int NOT NULL,
	`reference` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `gifts_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `instant_recipients` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`instantId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`openedAt` timestamp,
	CONSTRAINT `instant_recipients_id` PRIMARY KEY(`id`),
	CONSTRAINT `instant_recipient` UNIQUE(`instantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `instants` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`key` varchar(512) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`text` varchar(60) NOT NULL,
	`closeFriends` boolean NOT NULL DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `notes_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `post_locations` (
	`postId` bigint unsigned NOT NULL,
	`latitude` int NOT NULL,
	`longitude` int NOT NULL,
	CONSTRAINT `post_locations_postId` PRIMARY KEY(`postId`)
);
--> statement-breakpoint
CREATE TABLE `post_tags` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`postId` bigint unsigned NOT NULL,
	`tag` varchar(50) NOT NULL,
	CONSTRAINT `post_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_tag_pair` UNIQUE(`postId`,`tag`)
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`userId` bigint unsigned NOT NULL,
	`theme` enum('system','light','dark') NOT NULL DEFAULT 'system',
	`language` enum('en','fr','yo') NOT NULL DEFAULT 'en',
	`requests` enum('followers','everyone','nobody') NOT NULL DEFAULT 'followers',
	CONSTRAINT `preferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `reposts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`postId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reposts_id` PRIMARY KEY(`id`),
	CONSTRAINT `repost_pair` UNIQUE(`userId`,`postId`)
);
--> statement-breakpoint
CREATE TABLE `restrictions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`targetId` bigint unsigned NOT NULL,
	CONSTRAINT `restrictions_id` PRIMARY KEY(`id`),
	CONSTRAINT `restriction_pair` UNIQUE(`userId`,`targetId`)
);
--> statement-breakpoint
CREATE TABLE `reward_campaigns` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(80) NOT NULL,
	`task` enum('signup','profile','first_post') NOT NULL,
	`amount` int NOT NULL,
	`remaining` bigint NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reward_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned,
	`event` varchar(80) NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `story_reactions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`storyId` bigint unsigned NOT NULL,
	`reaction` varchar(16) NOT NULL,
	`reply` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `story_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `story_reaction_pair` UNIQUE(`userId`,`storyId`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`creatorId` bigint unsigned NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriber_pair` UNIQUE(`userId`,`creatorId`)
);
--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(80) NOT NULL,
	`userId` bigint unsigned,
	`currency` enum('COIN','NGN') NOT NULL,
	`balance` bigint NOT NULL DEFAULT 0,
	`allowNegative` boolean NOT NULL DEFAULT false,
	`frozen` boolean NOT NULL DEFAULT false,
	CONSTRAINT `wallet_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_accounts_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `wallet_entries` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`journalId` bigint unsigned NOT NULL,
	`accountId` bigint unsigned NOT NULL,
	`amount` bigint NOT NULL,
	CONSTRAINT `wallet_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_account` UNIQUE(`journalId`,`accountId`)
);
--> statement-breakpoint
CREATE TABLE `wallet_journal` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`reference` varchar(160) NOT NULL,
	`currency` enum('COIN','NGN') NOT NULL,
	`kind` varchar(40) NOT NULL,
	`description` varchar(240) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_journal_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_journal_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `wallet_verification` (
	`userId` bigint unsigned NOT NULL,
	`verifiedAt` timestamp,
	`verificationReference` varchar(120),
	`recipientCode` varchar(100),
	`recipientLabel` varchar(100),
	`pinHash` varchar(200),
	CONSTRAINT `wallet_verification_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `wallet_verification_verificationReference_unique` UNIQUE(`verificationReference`)
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`reference` varchar(80) NOT NULL,
	`requestKey` varchar(80) NOT NULL,
	`amount` int NOT NULL,
	`recipientCode` varchar(100) NOT NULL,
	`status` enum('reserved','submitted','paid','failed') NOT NULL DEFAULT 'reserved',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `withdrawals_id` PRIMARY KEY(`id`),
	CONSTRAINT `withdrawals_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `withdrawal_user_request` UNIQUE(`userId`,`requestKey`)
);
--> statement-breakpoint
ALTER TABLE `uploads` MODIFY COLUMN `purpose` enum('post','avatar','story','chat','instant') NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `parentId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `stories` ADD `contentType` varchar(40) DEFAULT 'image/webp' NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `closeFriends` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_funding` ADD CONSTRAINT `cash_funding_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_members` ADD CONSTRAINT `chat_members_threadId_chat_threads_id_fk` FOREIGN KEY (`threadId`) REFERENCES `chat_threads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_members` ADD CONSTRAINT `chat_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_threadId_chat_threads_id_fk` FOREIGN KEY (`threadId`) REFERENCES `chat_threads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_reactions` ADD CONSTRAINT `chat_reactions_messageId_chat_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `chat_messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_reactions` ADD CONSTRAINT `chat_reactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD CONSTRAINT `chat_threads_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `close_friends` ADD CONSTRAINT `close_friends_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `close_friends` ADD CONSTRAINT `close_friends_targetId_users_id_fk` FOREIGN KEY (`targetId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_posts` ADD CONSTRAINT `collection_posts_collectionId_collections_id_fk` FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_posts` ADD CONSTRAINT `collection_posts_postId_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collections` ADD CONSTRAINT `collections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_likes` ADD CONSTRAINT `comment_likes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_likes` ADD CONSTRAINT `comment_likes_commentId_comments_id_fk` FOREIGN KEY (`commentId`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drafts` ADD CONSTRAINT `drafts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gifts` ADD CONSTRAINT `gifts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gifts` ADD CONSTRAINT `gifts_creatorId_users_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `instant_recipients` ADD CONSTRAINT `instant_recipients_instantId_instants_id_fk` FOREIGN KEY (`instantId`) REFERENCES `instants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `instant_recipients` ADD CONSTRAINT `instant_recipients_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `instants` ADD CONSTRAINT `instants_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notes` ADD CONSTRAINT `notes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_locations` ADD CONSTRAINT `post_locations_postId_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_tags` ADD CONSTRAINT `post_tags_postId_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preferences` ADD CONSTRAINT `preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reposts` ADD CONSTRAINT `reposts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reposts` ADD CONSTRAINT `reposts_postId_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restrictions` ADD CONSTRAINT `restrictions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restrictions` ADD CONSTRAINT `restrictions_targetId_users_id_fk` FOREIGN KEY (`targetId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `security_events` ADD CONSTRAINT `security_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `story_reactions` ADD CONSTRAINT `story_reactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `story_reactions` ADD CONSTRAINT `story_reactions_storyId_stories_id_fk` FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_creatorId_users_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_accounts` ADD CONSTRAINT `wallet_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_entries` ADD CONSTRAINT `wallet_entries_journalId_wallet_journal_id_fk` FOREIGN KEY (`journalId`) REFERENCES `wallet_journal`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_entries` ADD CONSTRAINT `wallet_entries_accountId_wallet_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `wallet_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_verification` ADD CONSTRAINT `wallet_verification_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `withdrawals` ADD CONSTRAINT `withdrawals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chat_member_inbox` ON `chat_members` (`userId`,`threadId`);--> statement-breakpoint
CREATE INDEX `chat_history` ON `chat_messages` (`threadId`,`deliverAt`,`id`);--> statement-breakpoint
CREATE INDEX `instant_expiry` ON `instants` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `notes_expiry` ON `notes` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `hashtag_search` ON `post_tags` (`tag`,`postId`);--> statement-breakpoint
CREATE INDEX `repost_post` ON `reposts` (`postId`);--> statement-breakpoint
CREATE INDEX `security_event_date` ON `security_events` (`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `wallet_history` ON `wallet_entries` (`accountId`,`id`);