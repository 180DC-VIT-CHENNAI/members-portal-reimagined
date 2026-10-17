CREATE TABLE `newsletter_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`confirm_token_hash` text,
	`confirm_expires_at` text,
	`confirmed_at` text,
	`last_unsubscribed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_email` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_unsubscribe` ON `newsletter_subscribers` (`unsubscribe_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_confirm` ON `newsletter_subscribers` (`confirm_token_hash`);--> statement-breakpoint
CREATE INDEX `newsletter_subscribers_status` ON `newsletter_subscribers` (`status`);
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission, scope) VALUES ('admin', 'newsletter.manage', 'global');
