CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_studies` (
	`id` text PRIMARY KEY NOT NULL,
	`tag` text DEFAULT 'Uncategorized' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`image_url` text,
	`source_file_url` text,
	`author_name` text DEFAULT 'Anonymous' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `case_studies_created` ON `case_studies` (`created_at`);--> statement-breakpoint
CREATE TABLE `consulting_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`organization` text NOT NULL,
	`role_in_org` text,
	`requirement` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consulting_requests_status` ON `consulting_requests` (`status`);--> statement-breakpoint
CREATE TABLE `consulting_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`email_subject` text NOT NULL,
	`email_body` text NOT NULL,
	`sent_by` text,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `consulting_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consulting_responses_request` ON `consulting_responses` (`request_id`);--> statement-breakpoint
CREATE TABLE `maintenance_mode` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`message` text DEFAULT 'Site is under maintenance. Please check back later.' NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`website_url` text,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`ip` text NOT NULL,
	`endpoint` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`window_start` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`ip`, `endpoint`)
);

--> statement-breakpoint
-- Reference data for slice 1: the maintenance switch (off), the client logos
-- the old landing page showed, and grants for the new permission keys. Old
-- power levels map to roles: >= 10 member (publish), >= 50 director (manage
-- content), >= 100 admin (consulting, announcements, maintenance).
INSERT OR IGNORE INTO `maintenance_mode` (`id`, `enabled`, `message`) VALUES (1, 0, 'Site is under maintenance. Please check back later.');
--> statement-breakpoint
INSERT OR IGNORE INTO `partners` (`id`, `name`, `logo_url`, `sort_order`) VALUES ('partner_adigo', 'AdigoVR', '/partners/adigo.png', 10), ('partner_bfwp', 'Buy Food With Plastic — Sustainability X Hunger Relief', '/partners/bfwp.png', 20), ('partner_joy', 'JoySuperApp', '/partners/joy.png', 30), ('partner_saira', 'SaiRa Jobs', '/partners/saira.png', 40), ('partner_yaapt', 'YAAPT', '/partners/yaapt.png', 50);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'content.publish', 'global'), ('admin', 'content.manage', 'global'), ('admin', 'consulting.manage', 'global'), ('admin', 'announcements.manage', 'global'), ('admin', 'site.maintenance', 'global'), ('director', 'content.publish', 'global'), ('director', 'content.manage', 'global'), ('member', 'content.publish', 'global'), ('advisory', 'content.publish', 'global');
