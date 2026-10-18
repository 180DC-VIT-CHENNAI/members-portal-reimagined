CREATE TABLE `meet_action_items` (
	`meet_id` text NOT NULL,
	`task_id` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`meet_id`, `task_id`),
	FOREIGN KEY (`meet_id`) REFERENCES `meets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meet_action_items_task` ON `meet_action_items` (`task_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`comment_id` integer,
	`actor_id` text,
	`due_date` text,
	`dedupe_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe` ON `notifications` (`recipient_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_inbox` ON `notifications` (`recipient_id`,`read_at`,`id`);--> statement-breakpoint
CREATE INDEX `notifications_task` ON `notifications` (`task_id`);--> statement-breakpoint
ALTER TABLE `meets` ADD `agenda` text;--> statement-breakpoint
ALTER TABLE `meets` ADD `notes` text;