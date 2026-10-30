import type { ComplianceItem } from "./calibration";

export interface ComplianceInput {
  /** The event's published limit, if known. */
  videoMaxSec: number | null;
  /** Planned or assembled length: the rendered cut if one exists, else the section plan total. */
  plannedVideoSec: number | null;
  requiredTech: string[];
  /** Dependency names and capability summaries detected in the repo. */
  repoSignals: string[] | null;
  repoVisibility: "public" | "private" | "unknown" | null;
  repoPublicRequired: boolean | null;
  deadlineIso: string | null;
  timezone: string;
  now: Date;
}

const techMatches = (tech: string, signals: string[]) => {
  const needle = tech.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (needle.length < 2) return false;
  return signals.some((signal) =>
    signal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .includes(needle),
  );
};

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export function formatInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: timezone, timeZoneName: "short" }).format(new Date(iso));
}

export function computeCompliance(input: ComplianceInput): ComplianceItem[] {
  const items: ComplianceItem[] = [];

  if (input.videoMaxSec === null) {
    items.push({ id: "video_limit", label: "Video within limit", status: "unknown", detail: "The event page does not state a video limit." });
  } else if (input.plannedVideoSec === null) {
    items.push({ id: "video_limit", label: "Video within limit", status: "unknown", detail: `Limit is ${formatDuration(input.videoMaxSec)}; no section plan or cut yet.` });
  } else {
    const over = input.plannedVideoSec > input.videoMaxSec;
    items.push({
      id: "video_limit",
      label: "Video within limit",
      status: over ? "fail" : "pass",
      detail: over
        ? `${formatDuration(input.plannedVideoSec)} is ${formatDuration(input.plannedVideoSec - input.videoMaxSec)} over the ${formatDuration(input.videoMaxSec)} limit.`
        : `${formatDuration(input.plannedVideoSec)} of ${formatDuration(input.videoMaxSec)}.`,
    });
  }

  if (input.requiredTech.length === 0) {
    items.push({ id: "required_tech", label: "Required technology in repo", status: "pass", detail: "The event lists no required technology." });
  } else if (input.repoSignals === null) {
    items.push({ id: "required_tech", label: "Required technology in repo", status: "unknown", detail: `Link a repo to check for ${input.requiredTech.join(", ")}.` });
  } else {
    const missing = input.requiredTech.filter((tech) => !techMatches(tech, input.repoSignals ?? []));
    items.push({
      id: "required_tech",
      label: "Required technology in repo",
      status: missing.length === 0 ? "pass" : "fail",
      detail: missing.length === 0 ? `Found ${input.requiredTech.join(", ")}.` : `Not detected: ${missing.join(", ")}.`,
    });
  }

  if (input.repoVisibility === null) {
    items.push({ id: "repo_public", label: "Repo is public", status: "unknown", detail: "No repo linked yet." });
  } else if (input.repoVisibility === "unknown") {
    items.push({ id: "repo_public", label: "Repo is public", status: "unknown", detail: "GitHub did not report the repo's visibility." });
  } else {
    const ok = input.repoVisibility === "public" || input.repoPublicRequired === false;
    items.push({
      id: "repo_public",
      label: "Repo is public",
      status: ok ? "pass" : "fail",
      detail:
        input.repoVisibility === "public"
          ? "The repo is public."
          : input.repoPublicRequired === false
            ? "Private, and the event does not require a public repo."
            : "The repo is private. Make it public before submitting.",
    });
  }

  if (input.deadlineIso === null) {
    items.push({ id: "deadline", label: "Before the deadline", status: "unknown", detail: "The event page does not state a deadline." });
  } else {
    const remaining = Date.parse(input.deadlineIso) - input.now.getTime();
    const when = formatInZone(input.deadlineIso, input.timezone);
    items.push({
      id: "deadline",
      label: "Before the deadline",
      status: remaining > 0 ? "pass" : "fail",
      detail: remaining > 0 ? `${formatCountdown(remaining)} left (due ${when}).` : `Deadline passed ${formatCountdown(remaining)} ago (${when}).`,
    });
  }

  return items;
}
