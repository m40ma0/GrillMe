ALTER TABLE "claims" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "model_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "model_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "judge_turns" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "judge_turns" ADD COLUMN "model_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "model_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL;