CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text,
	`title` text NOT NULL,
	`rank` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_department_title` ON `positions` (`department_id`,`title`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	PRIMARY KEY(`role_id`, `permission`),
	FOREIGN KEY (`role_id`) REFERENCES `access_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_person_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_target` ON `audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`auth_user_id` text,
	`full_name` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`department_id` text,
	`access_role_id` text NOT NULL,
	`phone` text,
	`reg_no` text,
	`year` integer,
	`branch` text,
	`linkedin_url` text,
	`github_url` text,
	`photo_key` text,
	`bio` text,
	`skills` text DEFAULT '[]' NOT NULL,
	`invited_by` text,
	`activated_at` text,
	`status_changed_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`access_role_id`) REFERENCES `access_roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_email` ON `people` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_auth_user` ON `people` (`auth_user_id`);--> statement-breakpoint
CREATE INDEX `people_status` ON `people` (`status`);--> statement-breakpoint
CREATE INDEX `people_department` ON `people` (`department_id`);--> statement-breakpoint
CREATE TABLE `person_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`permission` text NOT NULL,
	`department_id` text,
	`granted_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_grants_unique` ON `person_grants` (`person_id`,`permission`,`department_id`);--> statement-breakpoint
CREATE TABLE `tenures` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`position_id` text NOT NULL,
	`term_id` text NOT NULL,
	`started_on` text NOT NULL,
	`ended_on` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tenures_person` ON `tenures` (`person_id`);--> statement-breakpoint
CREATE INDEX `tenures_term` ON `tenures` (`term_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenures_unique` ON `tenures` (`person_id`,`position_id`,`term_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
-- Reference data: departments, current term, access roles and their
-- permissions, standard positions, and the first admin (activated on first
-- Google sign-in).
INSERT OR IGNORE INTO `departments` (`id`, `name`) VALUES ('business_strategy', 'Business Strategy'), ('crm', 'CRM'), ('finance', 'Finance'), ('marketing', 'Marketing'), ('operations', 'Operations'), ('tech', 'Tech');
--> statement-breakpoint
INSERT OR IGNORE INTO `terms` (`id`, `label`, `starts_on`, `ends_on`, `is_current`) VALUES ('2026-27', '2026-27', '2026-07-01', '2027-06-30', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO `access_roles` (`id`, `name`, `description`, `is_system`) VALUES ('admin', 'Admin', 'Full access to everything', 1), ('director', 'Director', 'Manages people in their own department', 1), ('member', 'Member', 'Sees the directory and edits own profile', 1), ('advisory', 'Advisory', 'Sees the directory', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'people.view', 'global'), ('admin', 'people.view_private', 'global'), ('admin', 'people.invite', 'global'), ('admin', 'people.edit', 'global'), ('admin', 'people.lifecycle', 'global'), ('admin', 'people.grants', 'global'), ('admin', 'people.import', 'global'), ('admin', 'people.export', 'global'), ('admin', 'positions.manage', 'global'), ('admin', 'terms.manage', 'global'), ('admin', 'roles.manage', 'global'), ('admin', 'audit.view', 'global'), ('director', 'people.view', 'global'), ('director', 'people.view_private', 'department'), ('director', 'people.invite', 'department'), ('director', 'people.edit', 'department'), ('director', 'people.lifecycle', 'department'), ('director', 'people.export', 'department'), ('director', 'positions.manage', 'department'), ('member', 'people.view', 'global'), ('advisory', 'people.view', 'global');
--> statement-breakpoint
INSERT OR IGNORE INTO `positions` (`id`, `department_id`, `title`, `rank`) VALUES ('pos_chairperson', NULL, 'Chairperson', 10), ('pos_vice_chairperson', NULL, 'Vice Chairperson', 20), ('pos_secretary', NULL, 'Secretary', 30), ('pos_co_secretary', NULL, 'Co-Secretary', 40), ('pos_advisory', NULL, 'Advisory Board', 90), ('pos_business_strategy_director', 'business_strategy', 'Director', 50), ('pos_business_strategy_member', 'business_strategy', 'Member', 100), ('pos_crm_director', 'crm', 'Director', 50), ('pos_crm_member', 'crm', 'Member', 100), ('pos_finance_director', 'finance', 'Director', 50), ('pos_finance_member', 'finance', 'Member', 100), ('pos_marketing_director', 'marketing', 'Director', 50), ('pos_marketing_member', 'marketing', 'Member', 100), ('pos_operations_director', 'operations', 'Director', 50), ('pos_operations_member', 'operations', 'Member', 100), ('pos_tech_director', 'tech', 'Director', 50), ('pos_tech_member', 'tech', 'Member', 100), ('pos_tech_devops_lead', 'tech', 'Technical Lead - DevOps & Cloud', 60);
--> statement-breakpoint
INSERT OR IGNORE INTO `people` (`id`, `email`, `full_name`, `status`, `department_id`, `access_role_id`) VALUES ('person_srijan', 'srijan.guchhait@gmail.com', 'Srijan Guchhait', 'invited', 'tech', 'admin');
--> statement-breakpoint
INSERT OR IGNORE INTO `tenures` (`id`, `person_id`, `position_id`, `term_id`, `started_on`) VALUES ('tenure_srijan_2026_27', 'person_srijan', 'pos_tech_devops_lead', '2026-27', '2026-07-01');
