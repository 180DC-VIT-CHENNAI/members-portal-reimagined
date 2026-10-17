CREATE TABLE `project_departments` (
	`project_id` text NOT NULL,
	`department_id` text NOT NULL,
	PRIMARY KEY(`project_id`, `department_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_departments_department` ON `project_departments` (`department_id`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_person` ON `project_members` (`project_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `project_members_by_person` ON `project_members` (`person_id`);--> statement-breakpoint
CREATE TABLE `project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assignee_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_date` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`completed_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_tasks_project` ON `project_tasks` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `project_tasks_assignee` ON `project_tasks` (`assignee_id`,`status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`client` text,
	`description` text,
	`term_id` text,
	`deadline` text,
	`status` text DEFAULT 'active' NOT NULL,
	`completed_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_status` ON `projects` (`status`,`completed_at`);--> statement-breakpoint
-- Projects grants. Old rules: the board creates, completes and removes projects and sees
-- them all; directors manage people and tasks on their department's projects; everyone
-- sees their department's projects (project members also see the projects they are on).
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'projects.view', 'global'), ('admin', 'projects.manage', 'global'), ('admin', 'projects.members.manage', 'global'), ('admin', 'projects.tasks.manage', 'global'), ('director', 'projects.view', 'department'), ('director', 'projects.members.manage', 'department'), ('director', 'projects.tasks.manage', 'department'), ('member', 'projects.view', 'department'), ('advisory', 'projects.view', 'department');