import type { PersonaRole, SectionKey } from "@stage-ready/shared";

export interface StudioPersona {
  id: string;
  role: PersonaRole;
  label: string;
  voicePreset: string;
  questionStyle: string;
}

export interface StudioProps {
  projectId: string;
  projectName: string;
  demoMode: boolean;
  cloudUploadEnabled: boolean;
  personas: StudioPersona[];
  criteria: { id: string; name: string }[];
  sections: { key: SectionKey; title: string; budgetSec: number }[];
  /** The tracker the session will use, known before it starts ("sam" or "phash"). */
  expectedVision: string;
}

export const DISC = ["bg-persona-1/15 ring-persona-1", "bg-persona-2/15 ring-persona-2", "bg-persona-3/15 ring-persona-3"] as const;

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
