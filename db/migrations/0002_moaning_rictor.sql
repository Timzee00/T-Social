CREATE TABLE `chat_receipts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`messageId` bigint unsigned NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_receipt_pair` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `chat_receipts` ADD CONSTRAINT `chat_receipts_messageId_chat_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `chat_messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_receipts` ADD CONSTRAINT `chat_receipts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;