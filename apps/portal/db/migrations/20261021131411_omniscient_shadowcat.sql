CREATE TABLE `mail_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`message_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`content_id` text,
	`inline` integer DEFAULT false NOT NULL,
	`quarantine_status` text NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `mail_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_attachments_message` ON `mail_attachments` (`mailbox_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `mail_conversation_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `mail_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_notes_conversation` ON `mail_conversation_notes` (`mailbox_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mail_conversation_participants` (
	`conversation_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`address` text NOT NULL,
	PRIMARY KEY(`conversation_id`, `address`),
	FOREIGN KEY (`conversation_id`) REFERENCES `mail_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_participants_address` ON `mail_conversation_participants` (`mailbox_id`,`address`);--> statement-breakpoint
CREATE TABLE `mail_conversation_reads` (
	`conversation_id` text NOT NULL,
	`person_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`conversation_id`, `person_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `mail_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mail_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`subject` text NOT NULL,
	`subject_key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`assigned_to` text,
	`due_for_reply_at` text,
	`crm_contact_id` text,
	`last_message_at` text NOT NULL,
	`last_inbound_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mail_conversations_status" CHECK("mail_conversations"."status" IN ('open','pending','closed')),
	CONSTRAINT "mail_conversations_priority" CHECK("mail_conversations"."priority" IN ('low','normal','high','urgent'))
);
--> statement-breakpoint
CREATE INDEX `mail_conversations_inbox` ON `mail_conversations` (`mailbox_id`,`status`,`last_message_at`,`id`);--> statement-breakpoint
CREATE INDEX `mail_conversations_subject` ON `mail_conversations` (`mailbox_id`,`subject_key`);--> statement-breakpoint
CREATE TABLE `mail_inbound_events` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`raw_sha256` text NOT NULL,
	`content_key` text NOT NULL,
	`message_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_inbound_raw` ON `mail_inbound_events` (`mailbox_id`,`raw_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_inbound_content` ON `mail_inbound_events` (`mailbox_id`,`content_key`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`conversation_id` text,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`quarantine_reason` text,
	`rfc_message_id` text,
	`provider_message_id` text,
	`in_reply_to` text,
	`references_json` text NOT NULL,
	`outbound_id` text,
	`envelope_from` text NOT NULL,
	`envelope_to` text NOT NULL,
	`from_json` text NOT NULL,
	`to_json` text NOT NULL,
	`cc_json` text NOT NULL,
	`reply_to_json` text NOT NULL,
	`subject` text NOT NULL,
	`text` text NOT NULL,
	`html_object_key` text,
	`raw_object_key` text,
	`raw_sha256` text,
	`raw_size` integer NOT NULL,
	`auth_signals` text DEFAULT '' NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `mail_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mail_messages_direction" CHECK("mail_messages"."direction" IN ('in','out')),
	CONSTRAINT "mail_messages_status" CHECK("mail_messages"."status" IN ('received','quarantined','accepted','outcome_unknown'))
);
--> statement-breakpoint
CREATE INDEX `mail_messages_thread` ON `mail_messages` (`mailbox_id`,`conversation_id`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `mail_messages_rfc` ON `mail_messages` (`mailbox_id`,`rfc_message_id`);--> statement-breakpoint
CREATE INDEX `mail_messages_quarantine` ON `mail_messages` (`mailbox_id`,`status`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_messages_outbound` ON `mail_messages` (`outbound_id`);--> statement-breakpoint
CREATE TABLE `mail_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`conversation_id` text,
	`draft_id` text,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `mail_conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`draft_id`) REFERENCES `mail_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_notifications_once` ON `mail_notifications` (`recipient_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `mail_notifications_inbox` ON `mail_notifications` (`recipient_id`,`read_at`,`id`);--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `inbound_enabled` integer DEFAULT false NOT NULL;