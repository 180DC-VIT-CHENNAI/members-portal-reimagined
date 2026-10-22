CREATE TABLE `onboarding_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`href` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`note` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_reviews_source` ON `access_reviews` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `access_reviews_person` ON `access_reviews` (`person_id`,`status`);--> statement-breakpoint
CREATE TABLE `board_handover_items` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`title` text NOT NULL,
	`owner_person_id` text,
	`done` integer DEFAULT false NOT NULL,
	`done_at` text,
	`done_by` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `board_handover_items_term` ON `board_handover_items` (`term_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `department_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`department_id` text NOT NULL,
	`note` text,
	`valid_from` text NOT NULL,
	`valid_until` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `department_memberships_person` ON `department_memberships` (`person_id`);--> statement-breakpoint
CREATE INDEX `department_memberships_department` ON `department_memberships` (`department_id`,`valid_until`);--> statement-breakpoint
CREATE TABLE `offboarding_records` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`to_status` text NOT NULL,
	`successor_id` text,
	`reason` text NOT NULL,
	`effective_on` text NOT NULL,
	`checklist` text NOT NULL,
	`summary` text NOT NULL,
	`actor_person_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`successor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offboarding_records_person` ON `offboarding_records` (`person_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `person_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text,
	`effective_on` text NOT NULL,
	`actor_person_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `person_status_history_person` ON `person_status_history` (`person_id`,`id`);--> statement-breakpoint
CREATE TABLE `promotion_decisions` (
	`proposal_id` text PRIMARY KEY NOT NULL,
	`actor_person_id` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `promotion_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `promotion_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`position_id` text NOT NULL,
	`term_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`rationale` text NOT NULL,
	`letter_document_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposed_by` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text,
	`tenure_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenure_id`) REFERENCES `tenures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `promotion_proposals_person` ON `promotion_proposals` (`person_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `promotion_proposals_status` ON `promotion_proposals` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `tenures` ADD `reports_to_person_id` text REFERENCES people(id);--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'people.promotions.approve', 'global'), ('admin', 'people.offboard', 'global'), ('admin', 'onboarding.manage', 'global'), ('director', 'people.promotions.approve', 'department'), ('director', 'people.offboard', 'department');
