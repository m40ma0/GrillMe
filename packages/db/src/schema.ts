import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(), tagline: text("tagline").notNull(),
  timezone: text("timezone").notNull().default("Asia/Singapore"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  spec: jsonb("spec").notNull(), sourceUrl: text("source_url"),
});

export const winners = pgTable("winners", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  profile: jsonb("profile").notNull(), sourceUrl: text("source_url").notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(), status: text("status").notNull().default("complete"),
  score: real("score"), transcript: text("transcript").notNull().default(""), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(), sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  text: text("text").notNull(), type: text("type").notNull(), status: text("status").notNull(),
  timestampSeconds: real("timestamp_seconds"), evidence: text("evidence"),
});

export const latencySamples = pgTable("latency_samples", {
  id: uuid("id").defaultRandom().primaryKey(), sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  step: text("step").notNull(), durationMs: integer("duration_ms").notNull(), sampleTime: timestamp("sample_time", { withTimezone: true }).notNull(),
});

export const judgeTurns = pgTable("judge_turns", {
  id: uuid("id").defaultRandom().primaryKey(), sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  persona: text("persona").notNull(), question: text("question").notNull(), answer: text("answer"), timestampSeconds: real("timestamp_seconds").notNull(),
});

export const takes = pgTable("takes", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  section: text("section").notNull(), score: real("score").notNull(), durationSeconds: real("duration_seconds").notNull(), mediaPath: text("media_path"), breakdown: jsonb("breakdown").notNull(),
});

export const fixTasks = pgTable("fix_tasks", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(), status: text("status").notNull().default("open"), evidence: text("evidence"),
});

export const coachNotes = pgTable("coach_notes", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  resolved: jsonb("resolved").notNull().default([]), stillOpen: jsonb("still_open").notNull().default([]), newItems: jsonb("new_items").notNull().default([]), nextPlan: jsonb("next_plan").notNull().default([]),
});

export const memoryEmbeddings = pgTable("memory_embeddings", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  content: text("content").notNull(), embedding: vector("embedding", { dimensions: 1536 }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const personas = pgTable("personas", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), isFictional: boolean("is_fictional").notNull().default(true), criteria: jsonb("criteria").notNull(), questionStyle: text("question_style").notNull(),
});

export const stepMaps = pgTable("step_maps", {
  id: uuid("id").defaultRandom().primaryKey(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  steps: jsonb("steps").notNull().default([]), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
