CREATE TABLE `mail_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_id` text,
	`safe_metadata` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_audit_page` ON `mail_audit` (`mailbox_id`,`id`);--> statement-breakpoint
CREATE TABLE `mail_draft_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`revision` integer NOT NULL,
	`mailbox_id` text NOT NULL,
	`conversation_id` text,
	`from_address` text NOT NULL,
	`from_name` text NOT NULL,
	`recipients` text NOT NULL,
	`subject` text NOT NULL,
	`text` text NOT NULL,
	`html` text NOT NULL,
	`signature` text NOT NULL,
	`category` text NOT NULL,
	`attachments` text NOT NULL,
	`template_version_id` text,
	`content_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `mail_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_snapshot_revision` ON `mail_draft_snapshots` (`draft_id`,`revision`);--> statement-breakpoint
CREATE TABLE `mail_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`conversation_id` text,
	`created_by` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`current_snapshot_id` text NOT NULL,
	`approved_review_id` text,
	`last_review_id` text,
	`active_intent_id` text,
	`updated_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_drafts_folder` ON `mail_drafts` (`mailbox_id`,`state`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `mail_outbound_switch` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mail_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`policy_version` integer NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`direct` integer DEFAULT false NOT NULL,
	`comments` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `mail_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `mail_draft_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_reviews_draft` ON `mail_reviews` (`draft_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mail_send_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`attempt_no` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`outcome` text NOT NULL,
	`error_code` text,
	`recipient_results` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`intent_id`) REFERENCES `mail_send_intents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_attempt_number` ON `mail_send_attempts` (`intent_id`,`attempt_no`);--> statement-breakpoint
CREATE TABLE `mail_send_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`approved_snapshot_id` text NOT NULL,
	`approval_review_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`state` text NOT NULL,
	`scheduled_at` text,
	`due_at` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`claimed_at` text,
	`claim_token` text,
	`provider_message_id` text,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `mail_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_snapshot_id`) REFERENCES `mail_draft_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approval_review_id`) REFERENCES `mail_reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_send_idempotency` ON `mail_send_intents` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_send_active_draft` ON `mail_send_intents` (`draft_id`) WHERE "mail_send_intents"."state" <> 'cancelled';--> statement-breakpoint
CREATE INDEX `mail_send_due` ON `mail_send_intents` (`state`,`due_at`);--> statement-breakpoint
CREATE TABLE `mail_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`digest` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_uploads_mailbox` ON `mail_uploads` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `mailbox_memberships` (
	`mailbox_id` text NOT NULL,
	`person_id` text NOT NULL,
	`capability` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_until` text,
	`granted_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`mailbox_id`, `person_id`, `capability`),
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mailbox_memberships_capability_valid" CHECK("mailbox_memberships"."capability" IN ('mailbox.read','mailbox.draft.create','mailbox.draft.edit_own','mailbox.draft.edit_any','mailbox.draft.submit','mailbox.review','mailbox.approve','mailbox.send','mailbox.assign','mailbox.manage','mailbox.audit'))
);
--> statement-breakpoint
CREATE INDEX `mailbox_memberships_person` ON `mailbox_memberships` (`person_id`,`mailbox_id`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`display_name` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`approval_required` integer DEFAULT true NOT NULL,
	`require_distinct_reviewer` integer DEFAULT true NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`outbound_adapter` text DEFAULT 'disabled' NOT NULL,
	`replies_only` integer DEFAULT true NOT NULL,
	`category_policy` text DEFAULT '["correspondence"]' NOT NULL,
	`outbound_paused` integer DEFAULT false NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mailboxes_status_valid" CHECK("mailboxes"."status" IN ('active','disabled','retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailboxes_address` ON `mailboxes` (`address`);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`,`permission`,`scope`)
VALUES ('admin','mailboxes.admin','global');
