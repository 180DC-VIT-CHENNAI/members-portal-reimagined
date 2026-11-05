CREATE TABLE `email_template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `email_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_template_version_number` ON `email_template_versions` (`template_id`,`version`);--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_scope` text NOT NULL,
	`owner_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`published_version_id` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "email_template_scope_valid" CHECK(("email_templates"."owner_scope"='global' AND "email_templates"."owner_id" IS NULL) OR ("email_templates"."owner_scope" IN ('department','mailbox') AND "email_templates"."owner_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `email_templates_scope` ON `email_templates` (`owner_scope`,`owner_id`,`id`);--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'templates.author', 'global'), ('admin', 'templates.edit', 'global'), ('admin', 'templates.publish', 'global'), ('admin', 'templates.retire', 'global'), ('admin', 'templates.draft', 'global'), ('admin', 'templates.review', 'global'), ('admin', 'templates.send', 'global'), ('director', 'templates.author', 'department'), ('director', 'templates.edit', 'department'), ('director', 'templates.publish', 'department'), ('director', 'templates.retire', 'department'), ('director', 'templates.draft', 'global'), ('director', 'templates.review', 'global'), ('director', 'templates.send', 'global'), ('member', 'templates.draft', 'global'), ('member', 'templates.review', 'global'), ('member', 'templates.send', 'global');
