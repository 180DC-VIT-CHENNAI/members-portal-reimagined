CREATE TABLE `instance_departments` (
	`instance_id` text NOT NULL,
	`department_id` text NOT NULL,
	PRIMARY KEY(`instance_id`, `department_id`),
	FOREIGN KEY (`instance_id`) REFERENCES `team_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `instance_departments_department` ON `instance_departments` (`department_id`);--> statement-breakpoint
CREATE TABLE `instance_externals` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`organization` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `team_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instance_externals_email` ON `instance_externals` (`instance_id`,`email`);--> statement-breakpoint
CREATE TABLE `instance_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`name` text NOT NULL,
	`organization` text,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `team_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `instance_groups_instance` ON `instance_groups` (`instance_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `instance_levels` (
	`instance_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`instance_id`, `position`),
	FOREIGN KEY (`instance_id`) REFERENCES `team_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `instance_team_externals` (
	`team_id` text NOT NULL,
	`external_id` text NOT NULL,
	`added_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`team_id`, `external_id`),
	FOREIGN KEY (`team_id`) REFERENCES `instance_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`external_id`) REFERENCES `instance_externals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `instance_team_externals_external` ON `instance_team_externals` (`external_id`);--> statement-breakpoint
CREATE TABLE `instance_team_members` (
	`team_id` text NOT NULL,
	`person_id` text NOT NULL,
	`added_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`team_id`, `person_id`),
	FOREIGN KEY (`team_id`) REFERENCES `instance_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `instance_team_members_person` ON `instance_team_members` (`person_id`);--> statement-breakpoint
CREATE TABLE `instance_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`group_id` text,
	`name` text NOT NULL,
	`description` text,
	`min_members` integer,
	`max_members` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`current_level` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `team_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `instance_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `instance_teams_instance` ON `instance_teams` (`instance_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `team_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`group_label` text DEFAULT 'Company' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
-- Team instance grants. Old rules: everyone except advisory members sees every instance;
-- directors (power >= 50) create and run their department's instances; the board runs them all.
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'team_instances.view', 'global'), ('director', 'team_instances.view', 'global'), ('member', 'team_instances.view', 'global'), ('admin', 'team_instances.manage', 'global'), ('director', 'team_instances.manage', 'department');