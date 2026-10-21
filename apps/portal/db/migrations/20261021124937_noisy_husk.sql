CREATE TABLE `conversation_members` (
	`conversation_id` text NOT NULL,
	`person_id` text NOT NULL,
	`last_read_message_id` integer DEFAULT 0 NOT NULL,
	`muted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`conversation_id`, `person_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversation_members_person` ON `conversation_members` (`person_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`direct_key` text,
	`department_id` text,
	`project_id` text,
	`created_by` text,
	`last_message_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_direct` ON `conversations` (`direct_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_department` ON `conversations` (`department_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_project` ON `conversations` (`project_id`);--> statement-breakpoint
CREATE TABLE `message_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`actor_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_notifications_once` ON `message_notifications` (`recipient_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `message_notifications_inbox` ON `message_notifications` (`recipient_id`,`read_at`,`id`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`message_id` integer NOT NULL,
	`person_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`message_id`, `person_id`, `emoji`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `message_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_reports_once` ON `message_reports` (`message_id`,`reporter_id`);--> statement-breakpoint
CREATE INDEX `message_reports_status` ON `message_reports` (`status`,`id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`reply_to_id` integer,
	`request_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_conversation` ON `messages` (`conversation_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_request` ON `messages` (`author_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`person_id` text NOT NULL,
	`category` text NOT NULL,
	`in_app` integer DEFAULT true NOT NULL,
	`email_digest` integer DEFAULT false NOT NULL,
	`quiet_start` text,
	`quiet_end` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`person_id`, `category`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'chat.moderate', 'global');
