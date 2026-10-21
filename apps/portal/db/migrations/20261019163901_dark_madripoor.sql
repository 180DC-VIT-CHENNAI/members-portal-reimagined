CREATE TABLE `crm_case_study_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `crm_engagements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_case_study_drafts_engagement_id_unique` ON `crm_case_study_drafts` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`full_name` text NOT NULL,
	`role_title` text,
	`email` text,
	`phone` text,
	`consent` text DEFAULT 'unknown' NOT NULL,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`preferred_channel` text,
	`restricted_notes` text,
	`merged_into_id` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `crm_organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_contacts_organization` ON `crm_contacts` (`organization_id`);--> statement-breakpoint
CREATE INDEX `crm_contacts_email` ON `crm_contacts` (`email`);--> statement-breakpoint
CREATE TABLE `crm_engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`project_id` text,
	`client_owner_id` text,
	`lead_id` text,
	`confidentiality` text DEFAULT 'confidential' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`deliverables_accepted` integer DEFAULT false NOT NULL,
	`files_archived` integer DEFAULT false NOT NULL,
	`knowledge_transfer_done` integer DEFAULT false NOT NULL,
	`client_feedback` text,
	`case_study_consent` integer DEFAULT false NOT NULL,
	`closed_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `crm_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`client_owner_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_engagements_opportunity` ON `crm_engagements` (`opportunity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_engagements_project` ON `crm_engagements` (`project_id`);--> statement-breakpoint
CREATE TABLE `crm_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`primary_contact_id` text,
	`title` text NOT NULL,
	`owner_id` text,
	`source` text DEFAULT 'other' NOT NULL,
	`stage_id` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`next_action` text,
	`next_action_due` text,
	`lost_reason` text,
	`lost_note` text,
	`consulting_request_id` text,
	`closed_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `crm_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `crm_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consulting_request_id`) REFERENCES `consulting_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_opportunities_request` ON `crm_opportunities` (`consulting_request_id`);--> statement-breakpoint
CREATE INDEX `crm_opportunities_organization` ON `crm_opportunities` (`organization_id`);--> statement-breakpoint
CREATE INDEX `crm_opportunities_owner_due` ON `crm_opportunities` (`owner_id`,`next_action_due`);--> statement-breakpoint
CREATE INDEX `crm_opportunities_stage` ON `crm_opportunities` (`stage_id`);--> statement-breakpoint
CREATE TABLE `crm_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`domain` text,
	`industry` text,
	`geography` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`lifecycle` text DEFAULT 'prospect' NOT NULL,
	`owner_id` text,
	`source` text DEFAULT 'other' NOT NULL,
	`merged_into_id` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_organizations_owner` ON `crm_organizations` (`owner_id`);--> statement-breakpoint
CREATE INDEX `crm_organizations_domain` ON `crm_organizations` (`domain`);--> statement-breakpoint
CREATE TABLE `crm_proposal_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`version` integer NOT NULL,
	`scope` text NOT NULL,
	`objectives` text DEFAULT '' NOT NULL,
	`timeline` text DEFAULT '' NOT NULL,
	`deliverables` text DEFAULT '' NOT NULL,
	`frozen_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `crm_proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_proposal_versions_number` ON `crm_proposal_versions` (`proposal_id`,`version`);--> statement-breakpoint
CREATE TABLE `crm_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`decided_at` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_proposals_opportunity` ON `crm_proposals` (`opportunity_id`);--> statement-breakpoint
CREATE TABLE `crm_record_access` (
	`id` text PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text DEFAULT 'collaborator' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_record_access_unique` ON `crm_record_access` (`record_type`,`record_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `crm_record_access_person` ON `crm_record_access` (`person_id`,`record_type`);--> statement-breakpoint
CREATE TABLE `crm_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'open' NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_touchpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text,
	`opportunity_id` text,
	`summary` text NOT NULL,
	`notes` text,
	`external_ref` text,
	`occurred_at` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `crm_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_touchpoints_organization` ON `crm_touchpoints` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `crm_touchpoints_opportunity` ON `crm_touchpoints` (`opportunity_id`,`occurred_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `crm_stages` (`id`, `label`, `kind`, `sort_order`) VALUES ('lead', 'Lead', 'open', 10), ('qualified', 'Qualified', 'open', 20), ('discovery', 'Discovery', 'open', 30), ('proposal', 'Proposal', 'open', 40), ('won', 'Won', 'won', 900), ('lost', 'Lost', 'lost', 910);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission`, `scope`) VALUES ('admin', 'crm.view', 'global'), ('admin', 'crm.manage', 'global'), ('admin', 'crm.admin', 'global'), ('director', 'crm.view', 'global'), ('director', 'crm.manage', 'global'), ('member', 'crm.view', 'global');
