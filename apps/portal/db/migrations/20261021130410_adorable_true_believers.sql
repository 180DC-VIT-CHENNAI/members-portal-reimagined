CREATE TABLE `document_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`max_downloads` integer,
	`downloads` integer DEFAULT 0 NOT NULL,
	`require_sign_in` integer DEFAULT false NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_shares_token_hash_unique` ON `document_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `document_shares_document` ON `document_shares` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`number` integer NOT NULL,
	`key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`uploaded_by` text,
	`restored_from` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_key_unique` ON `document_versions` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_number` ON `document_versions` (`document_id`,`number`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_file_id` text,
	`shared_key` text,
	`owner_id` text,
	`retention_until` text,
	`legal_hold` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_file_id`) REFERENCES `project_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_project_file_id_unique` ON `documents` (`project_file_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_shared_key_unique` ON `documents` (`shared_key`);--> statement-breakpoint
CREATE TABLE `knowledge_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`scope` text NOT NULL,
	`department_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`owner_id` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`project_id` text,
	`task_id` text,
	`meet_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_articles_slug_unique` ON `knowledge_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `knowledge_scope_status` ON `knowledge_articles` (`department_id`,`status`);--> statement-breakpoint
CREATE TABLE `knowledge_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` text NOT NULL,
	`number` integer NOT NULL,
	`snapshot` text NOT NULL,
	`edited_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `knowledge_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_revision_number` ON `knowledge_revisions` (`article_id`,`number`);--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'knowledge.view', 'global'), ('admin', 'knowledge.edit', 'global'), ('admin', 'knowledge.publish', 'global'), ('director', 'knowledge.view', 'global'), ('director', 'knowledge.edit', 'department'), ('director', 'knowledge.publish', 'department'), ('member', 'knowledge.view', 'global'), ('advisory', 'knowledge.view', 'global');
--> statement-breakpoint
CREATE TRIGGER `document_versions_enqueue_delete` AFTER DELETE ON `document_versions`
BEGIN
  INSERT OR IGNORE INTO `project_file_deletions` (`key`) VALUES (OLD.`key`);
END;
--> statement-breakpoint
CREATE TRIGGER `documents_legal_hold_delete` BEFORE DELETE ON `documents`
WHEN OLD.`legal_hold` = 1
BEGIN
  SELECT RAISE(ABORT, 'legal_hold');
END;
