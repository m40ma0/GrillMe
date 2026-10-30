CREATE TABLE "answer_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"script" text NOT NULL,
	"bridge_line" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_cards_questionId_unique" UNIQUE("question_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"segment_id" uuid,
	"text" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"suggested_rewrite" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid,
	"resolved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"new_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criteria" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"event_spec_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weight" real NOT NULL,
	"order" integer NOT NULL,
	"source_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "criteria_weight_range" CHECK ("criteria"."weight" >= 0 and "criteria"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "edls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_specs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_hash" text,
	"tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '{"videoMaxSec":null,"repoPublic":null,"deadlineIso":null}'::jsonb NOT NULL,
	"required_tech" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deadline_at" timestamp with time zone,
	"weights_inferred" boolean DEFAULT true NOT NULL,
	"source_quotes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"people_named" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dropped_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_specs_projectId_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fix_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"suggested_artifact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"step_map_id" uuid NOT NULL,
	"session_id" uuid,
	"step_id" uuid,
	"at_ms" integer NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action" text NOT NULL,
	"fallback_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"persona_id" uuid,
	"at_ms" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"trigger" text,
	"presenter_answer_segment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latency_samples" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"detector" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "past_winners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_url" text,
	"title" text NOT NULL,
	"placement" text NOT NULL,
	"profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"difficulty" integer DEFAULT 3 NOT NULL,
	"criteria_weights" jsonb NOT NULL,
	"question_style" text NOT NULL,
	"voice_preset" text NOT NULL,
	"is_fictional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personas_is_fictional" CHECK ("personas"."is_fictional" = true),
	CONSTRAINT "personas_difficulty_range" CHECK ("personas"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"video_limit_sec" integer DEFAULT 180 NOT NULL,
	"timezone" text DEFAULT 'Asia/Singapore' NOT NULL,
	"cloud_upload_enabled" boolean DEFAULT false NOT NULL,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"pitch_script" text DEFAULT '' NOT NULL,
	"setup_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"text" text NOT NULL,
	"persona_id" uuid,
	"likelihood" real NOT NULL,
	"damage" real NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asked_count" integer DEFAULT 0 NOT NULL,
	"last_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"edl_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_path" text NOT NULL,
	"line" integer,
	"summary" text NOT NULL,
	"severity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"github_full_name" text NOT NULL,
	"ref" text,
	"commit_sha" text,
	"visibility" text DEFAULT 'unknown' NOT NULL,
	"digest_url" text,
	"digest_tokens" integer,
	"file_count" integer,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repos_projectId_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "section_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"budget_sec" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"recording_url" text,
	"summary" jsonb,
	"rubric_heatmap" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"answer_card_id" uuid NOT NULL,
	"png_url" text,
	"pdf_url" text,
	"data_snapshot" jsonb NOT NULL,
	"verification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_maps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"golden_run_session_id" uuid,
	"fallback_clip_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"step_map_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"expected_keyframe_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_duration_ms" integer NOT NULL,
	"success_signal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fallback_in_ms" integer NOT NULL,
	"fallback_out_ms" integer NOT NULL,
	"narration" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "take_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"take_id" uuid NOT NULL,
	"total" real NOT NULL,
	"delivery" real NOT NULL,
	"coverage" real NOT NULL,
	"claim_penalty" real NOT NULL,
	"demo_success" real NOT NULL,
	"time_fit" real NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "take_scores_takeId_unique" UNIQUE("take_id")
);
--> statement-breakpoint
CREATE TABLE "takes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"section_plan_id" uuid NOT NULL,
	"session_id" uuid,
	"media_url" text,
	"duration_ms" integer NOT NULL,
	"transcript_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"github_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_githubLogin_unique" UNIQUE("github_login")
);
--> statement-breakpoint
CREATE TABLE "winning_patterns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"check" text NOT NULL,
	"check_result" text DEFAULT 'unknown' NOT NULL,
	"check_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_cards" ADD CONSTRAINT "answer_cards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_cards" ADD CONSTRAINT "answer_cards_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_segment_id_transcript_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_event_spec_id_event_specs_id_fk" FOREIGN KEY ("event_spec_id") REFERENCES "public"."event_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edls" ADD CONSTRAINT "edls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_specs" ADD CONSTRAINT "event_specs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fix_tasks" ADD CONSTRAINT "fix_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_step_map_id_step_maps_id_fk" FOREIGN KEY ("step_map_id") REFERENCES "public"."step_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_turns" ADD CONSTRAINT "judge_turns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_turns" ADD CONSTRAINT "judge_turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_turns" ADD CONSTRAINT "judge_turns_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latency_samples" ADD CONSTRAINT "latency_samples_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latency_samples" ADD CONSTRAINT "latency_samples_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_winners" ADD CONSTRAINT "past_winners_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_edl_id_edls_id_fk" FOREIGN KEY ("edl_id") REFERENCES "public"."edls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_findings" ADD CONSTRAINT "repo_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_findings" ADD CONSTRAINT "repo_findings_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_plans" ADD CONSTRAINT "section_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_answer_card_id_answer_cards_id_fk" FOREIGN KEY ("answer_card_id") REFERENCES "public"."answer_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_maps" ADD CONSTRAINT "step_maps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_maps" ADD CONSTRAINT "step_maps_golden_run_session_id_sessions_id_fk" FOREIGN KEY ("golden_run_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_step_map_id_step_maps_id_fk" FOREIGN KEY ("step_map_id") REFERENCES "public"."step_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "take_scores" ADD CONSTRAINT "take_scores_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "take_scores" ADD CONSTRAINT "take_scores_take_id_takes_id_fk" FOREIGN KEY ("take_id") REFERENCES "public"."takes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_section_plan_id_section_plans_id_fk" FOREIGN KEY ("section_plan_id") REFERENCES "public"."section_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD CONSTRAINT "winning_patterns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_session_id_index" ON "claims" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "coach_notes_project_id_index" ON "coach_notes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "criteria_event_spec_id_index" ON "criteria" USING btree ("event_spec_id");--> statement-breakpoint
CREATE INDEX "evidence_claim_id_index" ON "evidence" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "fix_tasks_project_id_index" ON "fix_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "judge_turns_session_id_index" ON "judge_turns" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "latency_samples_session_id_index" ON "latency_samples" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "past_winners_project_id_index" ON "past_winners" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "personas_project_id_index" ON "personas" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_owner_id_index" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "questions_project_id_index" ON "questions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "repo_findings_repo_id_index" ON "repo_findings" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_plans_project_id_key_index" ON "section_plans" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "sessions_project_id_index" ON "sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "steps_step_map_id_index" ON "steps" USING btree ("step_map_id");--> statement-breakpoint
CREATE INDEX "takes_section_plan_id_index" ON "takes" USING btree ("section_plan_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_session_id_index" ON "transcript_segments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "winning_patterns_project_id_index" ON "winning_patterns" USING btree ("project_id");