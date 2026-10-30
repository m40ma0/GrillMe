ALTER TABLE "incidents" ADD COLUMN "detection_ms" integer;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "detail" text DEFAULT '' NOT NULL;