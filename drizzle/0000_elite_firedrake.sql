CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`specialty` text DEFAULT 'General workforce' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`asset_code` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`daily_rate` integer DEFAULT 0 NOT NULL,
	`company_id` text NOT NULL,
	`project_id` text,
	`status` text DEFAULT 'Available' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `labours` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`employee_code` text DEFAULT '' NOT NULL,
	`trade` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`company_id` text NOT NULL,
	`project_id` text,
	`status` text DEFAULT 'Available' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'On track' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_unique` ON `projects` (`code`);