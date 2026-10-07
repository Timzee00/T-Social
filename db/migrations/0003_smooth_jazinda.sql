CREATE INDEX `chat_history_cursor` ON `chat_messages` (`threadId`,`id`);--> statement-breakpoint
CREATE INDEX `chat_pins` ON `chat_messages` (`threadId`,`pinned`,`id`);