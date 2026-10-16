CREATE TABLE `daily_email_count` (
	`date` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dev_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient` text NOT NULL,
	`from_address` text,
	`subject` text,
	`html` text,
	`headers` text,
	`attachments` text,
	`delivered_to` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_deliveries` (
	`campaign_id` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`campaign_id`, `recipient`)
);
--> statement-breakpoint
CREATE TABLE `email_hour_count` (
	`hour` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`from_address` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`attachments` text,
	`recipients` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`meta` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `email_queue_status_created` ON `email_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_queue_status_updated` ON `email_queue` (`status`,`updated_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES
('admin', 'email.view', 'global'),
('admin', 'email.manage', 'global'),
('admin', 'email.send', 'global'),
('director', 'email.send', 'department');
