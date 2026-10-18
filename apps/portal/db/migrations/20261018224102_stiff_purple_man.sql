CREATE TABLE `onboarding_acknowledgments` (
	`person_id` text NOT NULL,
	`item` text NOT NULL,
	`acknowledged_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`person_id`, `item`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
