CREATE TABLE `meet_departments` (
	`meet_id` text NOT NULL,
	`department_id` text NOT NULL,
	PRIMARY KEY(`meet_id`, `department_id`),
	FOREIGN KEY (`meet_id`) REFERENCES `meets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meet_departments_department` ON `meet_departments` (`department_id`);--> statement-breakpoint
CREATE TABLE `meets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`meet_link` text,
	`scheduled_at` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meets_kind_scheduled` ON `meets` (`kind`,`scheduled_at`);--> statement-breakpoint
-- Meets grants. Old rules: everyone signed in reads club-wide and inter-department
-- meets and their own department's; directors (power >= 50) schedule club-wide and
-- inter-department meets and manage their own department's; the board manages all.
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'meets.view', 'global'), ('director', 'meets.view', 'global'), ('member', 'meets.view', 'global'), ('advisory', 'meets.view', 'global'), ('admin', 'meets.department.view', 'global'), ('director', 'meets.department.view', 'department'), ('member', 'meets.department.view', 'department'), ('advisory', 'meets.department.view', 'department'), ('admin', 'meets.club.manage', 'global'), ('director', 'meets.club.manage', 'global'), ('admin', 'meets.inter_department.manage', 'global'), ('director', 'meets.inter_department.manage', 'global'), ('admin', 'meets.department.manage', 'global'), ('director', 'meets.department.manage', 'department');