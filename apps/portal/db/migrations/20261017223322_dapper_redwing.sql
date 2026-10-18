CREATE TABLE `letter_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`filename` text NOT NULL,
	`bytes` integer NOT NULL,
	`type` text NOT NULL,
	`docnum` text NOT NULL,
	`department_id` text,
	`snapshot` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `letter_documents_key_unique` ON `letter_documents` (`key`);--> statement-breakpoint
CREATE INDEX `letter_documents_department` ON `letter_documents` (`department_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `letter_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`recipient` text NOT NULL,
	`request_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`last_error` text,
	`accepted_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `letter_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `letter_sends_request` ON `letter_sends` (`created_by`,`request_id`);--> statement-breakpoint
CREATE INDEX `letter_sends_document` ON `letter_sends` (`document_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO role_permissions (role_id, permission, scope) VALUES ('admin', 'letters.manage', 'global'), ('admin', 'letters.send', 'global'), ('director', 'letters.manage', 'department'), ('director', 'letters.send', 'department');
