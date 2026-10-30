ALTER TABLE "coach_notes" ADD COLUMN "not_retested" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "capabilities_error" text;