ALTER TABLE "projects" ADD COLUMN "strongest_moment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "transcript" jsonb;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "error" text;