CREATE TABLE `github_accounts` (
	`person_id` text PRIMARY KEY NOT NULL,
	`github_user_id` integer NOT NULL,
	`login` text NOT NULL,
	`method` text NOT NULL,
	`linked_by` text,
	`verified_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_accounts_user` ON `github_accounts` (`github_user_id`);--> statement-breakpoint
CREATE TABLE `github_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`repository_id` integer NOT NULL,
	`issue_id` text,
	`kind` text NOT NULL,
	`actor_github_id` integer,
	`actor_login` text,
	`detail` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_activity_delivery` ON `github_activity` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `github_activity_repository` ON `github_activity` (`repository_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `github_activity_issue` ON `github_activity` (`issue_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `github_commit_checks` (
	`repository_id` integer NOT NULL,
	`sha` text NOT NULL,
	`source` text NOT NULL,
	`check_key` text NOT NULL,
	`name` text NOT NULL,
	`external_id` integer NOT NULL,
	`state` text NOT NULL,
	`conclusion` text,
	`details_url` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`repository_id`, `sha`, `source`, `check_key`),
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` integer PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`repository_selection` text NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`suspended_at` text,
	`deleted_at` text,
	`needs_repo_sync` integer DEFAULT true NOT NULL,
	`repos_synced_at` text,
	`rate_limited_until` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `github_issue_labels` (
	`issue_id` text NOT NULL,
	`label_id` integer NOT NULL,
	PRIMARY KEY(`issue_id`, `label_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `github_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_issue_labels_label` ON `github_issue_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `github_issue_links` (
	`pull_id` text NOT NULL,
	`target_id` text NOT NULL,
	PRIMARY KEY(`pull_id`, `target_id`),
	FOREIGN KEY (`pull_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_issue_links_target` ON `github_issue_links` (`target_id`);--> statement-breakpoint
CREATE TABLE `github_issue_participants` (
	`issue_id` text NOT NULL,
	`role` text NOT NULL,
	`github_user_id` integer NOT NULL,
	`login` text NOT NULL,
	PRIMARY KEY(`issue_id`, `role`, `github_user_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_issue_participants_user` ON `github_issue_participants` (`github_user_id`,`role`);--> statement-breakpoint
CREATE TABLE `github_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` integer NOT NULL,
	`number` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`state` text NOT NULL,
	`state_reason` text,
	`html_url` text NOT NULL,
	`author_github_id` integer,
	`author_login` text,
	`milestone_id` integer,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`due_date_set_by` text,
	`github_created_at` text NOT NULL,
	`github_updated_at` text NOT NULL,
	`closed_at` text,
	`draft` integer DEFAULT false NOT NULL,
	`merged` integer DEFAULT false NOT NULL,
	`merged_at` text,
	`head_ref` text,
	`head_sha` text,
	`base_ref` text,
	`pull_updated_at` text,
	`reviews` text DEFAULT '[]' NOT NULL,
	`review_decision` text DEFAULT 'none' NOT NULL,
	`check_status` text DEFAULT 'none' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `github_milestones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`due_date_set_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `github_issues_board` ON `github_issues` (`repository_id`,`kind`,`state`);--> statement-breakpoint
CREATE INDEX `github_issues_milestone` ON `github_issues` (`milestone_id`);--> statement-breakpoint
CREATE INDEX `github_issues_head` ON `github_issues` (`repository_id`,`head_sha`);--> statement-breakpoint
CREATE INDEX `github_issues_author` ON `github_issues` (`author_github_id`,`state`);--> statement-breakpoint
CREATE TABLE `github_labels` (
	`id` integer PRIMARY KEY NOT NULL,
	`repository_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`description` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_labels_repository` ON `github_labels` (`repository_id`,`name`);--> statement-breakpoint
CREATE TABLE `github_milestones` (
	`id` integer PRIMARY KEY NOT NULL,
	`repository_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`state` text NOT NULL,
	`due_on` text,
	`open_issues` integer DEFAULT 0 NOT NULL,
	`closed_issues` integer DEFAULT 0 NOT NULL,
	`github_created_at` text NOT NULL,
	`github_updated_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`repository_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_milestones_number` ON `github_milestones` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `github_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`issue_id` text NOT NULL,
	`actor_github_id` integer,
	`actor_login` text,
	`dedupe_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`issue_id`) REFERENCES `github_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_notifications_dedupe` ON `github_notifications` (`recipient_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `github_notifications_inbox` ON `github_notifications` (`recipient_id`,`read_at`,`id`);--> statement-breakpoint
CREATE INDEX `github_notifications_issue` ON `github_notifications` (`issue_id`);--> statement-breakpoint
CREATE TABLE `github_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `github_oauth_states_expiry` ON `github_oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `github_repositories` (
	`id` integer PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`owner_login` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`private` integer DEFAULT true NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`default_branch` text,
	`project_id` text,
	`mapped_by` text,
	`mapped_at` text,
	`removed_at` text,
	`sync_status` text DEFAULT 'idle' NOT NULL,
	`sync_mode` text DEFAULT 'full' NOT NULL,
	`sync_cursor` text,
	`sync_pass_started_at` text,
	`last_synced_at` text,
	`last_sync_error` text,
	`sync_failures` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `github_installations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`mapped_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `github_repositories_project` ON `github_repositories` (`project_id`);--> statement-breakpoint
CREATE INDEX `github_repositories_installation` ON `github_repositories` (`installation_id`);--> statement-breakpoint
CREATE INDEX `github_repositories_full_name` ON `github_repositories` (`full_name`);--> statement-breakpoint
CREATE TABLE `github_user_tokens` (
	`person_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`access_token` text,
	`access_token_expires_at` text,
	`refresh_token` text,
	`refresh_token_expires_at` text,
	`revoked_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `github_accounts`(`person_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`installation_id` integer,
	`repository_id` integer,
	`status` text DEFAULT 'processing' NOT NULL,
	`detail` text,
	`attempts` integer DEFAULT 1 NOT NULL,
	`payload_sha256` text NOT NULL,
	`received_at` text DEFAULT (datetime('now')) NOT NULL,
	`claimed_at` text DEFAULT (datetime('now')) NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `github_webhook_deliveries_status` ON `github_webhook_deliveries` (`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `github_webhook_deliveries_received` ON `github_webhook_deliveries` (`received_at`);--> statement-breakpoint
CREATE TABLE `github_write_requests` (
	`person_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`person_id`, `request_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `github_write_requests_created` ON `github_write_requests` (`created_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'github.manage', 'global'), ('admin', 'github.issues.write', 'global'), ('director', 'github.issues.write', 'department'), ('member', 'github.issues.write', 'department');
