ALTER TABLE `stories` ADD `caption` varchar(500);--> statement-breakpoint
ALTER TABLE `messages` ADD `replyId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `messages` ADD `editedAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `preferences` ADD `groupInvites` enum('followers','everyone','nobody') NOT NULL DEFAULT 'followers';--> statement-breakpoint
ALTER TABLE `preferences` ADD `mentions` enum('followers','everyone','nobody') NOT NULL DEFAULT 'followers';--> statement-breakpoint
ALTER TABLE `preferences` ADD `readReceipts` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `preferences` ADD `activityStatus` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `handle` varchar(40);--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `description` varchar(240);--> statement-breakpoint
ALTER TABLE `chat_threads` ADD CONSTRAINT `chat_threads_handle_unique` UNIQUE(`handle`);--> statement-breakpoint
ALTER TABLE `chat_members` ADD `memberTag` varchar(32);--> statement-breakpoint
ALTER TABLE `chat_members` ADD `notifications` enum('all','mentions','muted') NOT NULL DEFAULT 'all';--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `kind` enum('like','comment','follow','request','mention','group_mention') NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `storyId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `notifications` ADD `threadId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_storyId_stories_id_fk` FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_threadId_chat_threads_id_fk` FOREIGN KEY (`threadId`) REFERENCES `chat_threads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_story` ON `notifications` (`storyId`);--> statement-breakpoint
CREATE INDEX `notifications_thread` ON `notifications` (`threadId`);
