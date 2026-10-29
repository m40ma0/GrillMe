ALTER TABLE "latency_samples" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "latency_samples" ADD COLUMN "output_hash" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "submission_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "readme" text;