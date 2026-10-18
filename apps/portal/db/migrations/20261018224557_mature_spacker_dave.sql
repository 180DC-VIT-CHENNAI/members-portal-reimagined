CREATE TABLE `project_file_deletions` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`uploaded_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_files_key_unique` ON `project_files` (`key`);--> statement-breakpoint
CREATE INDEX `project_files_scope` ON `project_files` (`project_id`,`task_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `blocked_reason` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `internal` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `legacy_department_project_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_legacy_department_project` ON `projects` (`legacy_department_project_id`);
--> statement-breakpoint
-- Consolidate portal-local department work without importing legacy Worker data.
-- Retain the source rows and their IDs; compatibility routes resolve the link.
INSERT INTO `projects` (`id`, `name`, `description`, `deadline`, `status`, `internal`, `legacy_department_project_id`, `completed_at`, `created_by`, `created_at`)
SELECT lower(hex(randomblob(16))), `name`, `description`, `deadline`, `status`, 1, `id`,
  CASE WHEN `status` = 'completed' THEN `created_at` ELSE NULL END, `created_by`, `created_at`
FROM `department_projects`;
--> statement-breakpoint
INSERT INTO `project_departments` (`project_id`, `department_id`)
SELECT p.`id`, d.`department_id`
FROM `department_projects` d
JOIN `projects` p ON p.`legacy_department_project_id` = d.`id`;

--> statement-breakpoint
CREATE TRIGGER `project_files_enqueue_delete` AFTER DELETE ON `project_files`
BEGIN
  INSERT OR IGNORE INTO `project_file_deletions` (`key`) VALUES (OLD.`key`);
END;
