CREATE TABLE `department_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`file_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `department_documents_department` ON `department_documents` (`department_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `department_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `department_instructions_department` ON `department_instructions` (`department_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `department_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`deadline` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `department_projects_department` ON `department_projects` (`department_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `departments` ADD `description` text;
--> statement-breakpoint
-- Department descriptions from the old Worker's seed (only where none is set).
UPDATE `departments` SET `description` = 'Handles technical infrastructure, UI, and research & development' WHERE `id` = 'tech' AND `description` IS NULL;
--> statement-breakpoint
UPDATE `departments` SET `description` = 'Handles budgeting and financial planning' WHERE `id` = 'finance' AND `description` IS NULL;
--> statement-breakpoint
UPDATE `departments` SET `description` = 'Manages client relationships, partnerships, and sponsorships' WHERE `id` = 'crm' AND `description` IS NULL;
--> statement-breakpoint
UPDATE `departments` SET `description` = 'Plans and executes events and club initiatives' WHERE `id` = 'operations' AND `description` IS NULL;
--> statement-breakpoint
UPDATE `departments` SET `description` = 'Handles business strategy and organizational planning' WHERE `id` = 'business_strategy' AND `description` IS NULL;
--> statement-breakpoint
UPDATE `departments` SET `description` = 'Handles marketing, outreach, communications, and social media' WHERE `id` = 'marketing' AND `description` IS NULL;
--> statement-breakpoint
-- Department workspace grants. Old rules: anyone in the department (or board)
-- reads members and instructions; directors of the department (power >= 50)
-- see the workspace and manage documents, instructions and projects.
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'departments.members.view', 'global'), ('director', 'departments.members.view', 'department'), ('member', 'departments.members.view', 'department'), ('advisory', 'departments.members.view', 'department'), ('admin', 'departments.instructions.view', 'global'), ('director', 'departments.instructions.view', 'department'), ('member', 'departments.instructions.view', 'department'), ('advisory', 'departments.instructions.view', 'department'), ('admin', 'departments.workspace.view', 'global'), ('director', 'departments.workspace.view', 'department'), ('admin', 'departments.documents.manage', 'global'), ('director', 'departments.documents.manage', 'department'), ('admin', 'departments.instructions.manage', 'global'), ('director', 'departments.instructions.manage', 'department'), ('admin', 'departments.projects.manage', 'global'), ('director', 'departments.projects.manage', 'department');
