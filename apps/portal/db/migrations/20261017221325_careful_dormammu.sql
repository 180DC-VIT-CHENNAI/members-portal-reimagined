CREATE TABLE `newsletter_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_assets_key_unique` ON `newsletter_assets` (`key`);--> statement-breakpoint
CREATE TABLE `newsletters` (
	`issue` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`email_subject` text NOT NULL,
	`description` text,
	`content` text DEFAULT '' NOT NULL,
	`source_asset_id` text,
	`image_asset_id` text,
	`shared` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`broadcast_id` text,
	`sent_at` text,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_asset_id`) REFERENCES `newsletter_assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_asset_id`) REFERENCES `newsletter_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletters_id_unique` ON `newsletters` (`id`);
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission, scope) VALUES ('admin', 'newsletter.edit', 'global'), ('director', 'newsletter.edit', 'global'), ('member', 'newsletter.edit', 'global'), ('admin', 'newsletter.send', 'global'), ('director', 'newsletter.send', 'global');
