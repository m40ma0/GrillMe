import { zonedToIso, type EventSpecExtraction, type PersonaRole, type TrackRecommendation, type WinnerProfile, type WinningPattern } from "@stage-ready/shared";

// Deterministic extractors behind the mocked adapter. They only report what
// they can quote verbatim from the text, so their output passes the same
// source-quote enforcement as a real model reply.

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const ZONES: Record<string, string> = {
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  sgt: "Asia/Singapore",
  utc: "UTC",
  gmt: "UTC",
  bst: "Europe/London",
  cet: "Europe/Paris",
  cest: "Europe/Paris",
  ist: "Asia/Kolkata",
  jst: "Asia/Tokyo",
  aest: "Australia/Sydney",
};

/** Finds a deadline with an explicit time zone. Without one the deadline stays unknown. */
export function findDeadline(text: string): { iso: string; quote: string } | null {
  const iso = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})\b/.exec(text);
  if (iso && !Number.isNaN(Date.parse(iso[0]))) return { iso: new Date(iso[0]).toISOString(), quote: iso[0] };
  const re = new RegExp(
    `\\b(${MONTHS.join("|")}|${MONTHS.map((m) => m.slice(0, 3)).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?:,?\\s*(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?)?\\s*\\(?\\b(${Object.keys(ZONES).join("|")})\\b`,
    "i",
  );
  const match = re.exec(text);
  if (!match) return null;
  const [quote, monthName = "", day = "1", year = "1970", hour, minute, ampm, zone = ""] = match;
  const month = MONTHS.findIndex((m) => m.startsWith(monthName.toLowerCase().slice(0, 3)));
  let h = hour ? Number(hour) : 23;
  const min = hour ? Number(minute ?? 0) : 59;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const tz = ZONES[zone.toLowerCase()];
  if (!tz || month < 0) return null;
  return { iso: zonedToIso(Number(year), month, Number(day), h, min, tz), quote: quote.trim() };
}

export function findVideoLimit(text: string): { seconds: number; quote: string } | null {
  for (const sentence of sentences(text)) {
    if (!/video|demo|recording|pitch/i.test(sentence)) continue;
    const match =
      /(?:no more than|not exceed(?:ing)?|maximum(?: of)?|max(?:imum)?\.?|up to|under|at most|limit(?:ed)? to|≤)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\b/i.exec(sentence) ??
      /(\d+(?:\.\d+)?)[\s-]*(minutes?|mins?|seconds?|secs?)\s*(?:max(?:imum)?|or less|or shorter|limit)/i.exec(sentence);
    if (!match) continue;
    const value = Number(match[1]);
    const seconds = /^m/i.test(match[2] ?? "") ? value * 60 : value;
    return { seconds: Math.round(seconds), quote: match[0] };
  }
  return null;
}

export function heuristicEventSpec(text: string): EventSpecExtraction {
  const all = lines(text);
  const quotes: Record<string, string> = {};
  const name = all[0] && all[0].length <= 140 ? all[0] : "";
  if (name) quotes.name = name;

  const criteria: EventSpecExtraction["criteria"] = [];
  const weightRe = /^(.{2,80}?)\s*[([]?\s*(\d{1,3}(?:\.\d+)?)\s*%\s*[)\]]?\s*[:\-–—]?\s*(.*)$/;
  const headingIndex = all.findIndex((l) => /^(judging|evaluation|scoring)?\s*(criteria|rubric)\b/i.test(l) || /^judging\b/i.test(l));
  let weighted = 0;
  for (const line of all) {
    const m = weightRe.exec(line);
    if (!m || /\b(discount|off|prize|interest)\b/i.test(line)) continue;
    const [, rawName = "", weight = "0", rest = ""] = m;
    const cname = rawName.replace(/[:\-–—]+$/, "").trim();
    if (!cname || cname.split(/\s+/).length > 8) continue;
    const i = criteria.length;
    criteria.push({ name: cname, description: rest.trim(), weight: Number(weight) / 100 });
    quotes[`criteria.${i}`] = line;
    quotes[`criteria.${i}.weight`] = (/^.*?\d{1,3}(?:\.\d+)?\s*%\s*[)\]]?/.exec(line)?.[0] ?? line).trim();
    weighted++;
  }
  if (criteria.length === 0 && headingIndex >= 0) {
    for (const line of all.slice(headingIndex + 1, headingIndex + 12)) {
      const m = /^([A-Z][\w &/,'-]{2,60}?)\s*[:\-–—]\s*(.{3,})$/.exec(line);
      if (!m) break;
      const i = criteria.length;
      criteria.push({ name: (m[1] ?? "").trim(), description: (m[2] ?? "").trim(), weight: 0 });
      quotes[`criteria.${i}`] = line;
    }
  }

  const tracks: EventSpecExtraction["tracks"] = [];
  for (const line of all) {
    const m = /^tracks?\s*[:\-–—]\s*(.+)$/i.exec(line);
    if (!m) continue;
    const body = m[1] ?? "";
    const [first, ...desc] = body.split(/\.\s+/);
    for (const track of (first ?? "").split(/\s*[,;/]\s*|\s+and\s+/)) {
      if (!track.trim()) continue;
      quotes[`tracks.${tracks.length}`] = line;
      tracks.push({ name: track.trim().replace(/\.$/, ""), description: desc.join(". ").trim() });
    }
  }

  const requiredTech: string[] = [];
  for (const sentence of sentences(text)) {
    const m = /\b(?:must|required to|need to|should)\s+(?:use|be built (?:with|on)|integrate|incorporate)\s+(?:at least one\s+|an?\s+|the\s+)?([^.;,]{2,60})/i.exec(sentence);
    if (!m) continue;
    quotes[`requiredTech.${requiredTech.length}`] = sentence;
    requiredTech.push((m[1] ?? "").trim().replace(/\s+(model|models)$/i, ""));
  }

  const video = findVideoLimit(text);
  if (video) quotes["requirements.videoMaxSec"] = video.quote;
  const publicRepo = /\bpublic\s+(?:code\s+|github\s+)?repo(?:sitory)?\b/i.exec(text);
  const privateOk = /\bprivate\s+repo(?:sitorie)?s?\s+(?:are\s+)?(?:allowed|accepted|fine)\b/i.exec(text);
  const repoMatch = privateOk ?? publicRepo;
  if (repoMatch) quotes["requirements.repoPublic"] = repoMatch[0];
  const deadline = findDeadline(text);
  if (deadline) quotes["requirements.deadlineIso"] = deadline.quote;

  const peopleNamed: string[] = [];
  for (const line of all) {
    const m = /^(?:judges?|panel(?:ists)?|mentors?|hosts?|speakers?)\s*[:\-–—]\s*(.+)$/i.exec(line);
    if (!m) continue;
    for (const person of (m[1] ?? "").split(/\s*,\s*|\s+and\s+|\s*;\s*/)) {
      const clean = person
        .replace(/\(.*?\)/g, "")
        .replace(/\.$/, "")
        .trim();
      if (/^[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)+$/.test(clean)) peopleNamed.push(clean);
    }
  }

  return {
    name,
    tracks,
    criteria,
    weightsInferred: weighted === 0 || weighted !== criteria.length,
    requiredTech,
    requirements: { videoMaxSec: video?.seconds ?? null, repoPublic: privateOk ? false : publicRepo ? true : null, deadlineIso: deadline?.iso ?? null },
    sourceQuotes: quotes,
    peopleNamed,
  };
}

const PLACEMENT = /\b((?:1st|2nd|3rd|first|second|third)(?:\s+(?:place|prize))?|grand prize|winner|runner[- ]up|honou?rable mention|best [\w ]{2,30}? award)\b/i;

/** One winner per paragraph that names a placement. Fields it cannot quote stay unknown. */
export function heuristicWinners(text: string): WinnerProfile[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out: WinnerProfile[] = [];
  for (const block of blocks) {
    const placement = PLACEMENT.exec(block);
    if (!placement) continue;
    const first = lines(block)[0] ?? "";
    const titleMatch = /^([^:—–\-(]{2,80})/.exec(first.replace(PLACEMENT, "").replace(/^[\s:—–-]+/, ""));
    const title = titleMatch?.[1]?.trim() ?? "";
    if (!title) continue;
    const quotes: Record<string, string> = { title: first, placement: placement[0] };
    const moment = /\b(\d{1,2}):(\d{2})\b/.exec(block);
    const io = /\b(?:turn(?:s|ed)?|convert(?:s|ed)?|transform(?:s|ed)?)\s+([^.,;]{3,60}?)\s+into\s+([^.,;]{3,60})/i.exec(block);
    if (io) {
      quotes.inputType = io[0];
      quotes.outputType = io[0];
    }
    if (moment) quotes.strongestMomentSec = moment[0];
    out.push({
      title,
      placement: placement[0],
      inputType: io?.[1]?.trim() ?? "unknown",
      outputType: io?.[2]?.replace(/\s+(?:at|by|in)\s+\d{1,2}:\d{2}.*$/, "").trim() ?? "unknown",
      demoStructure: [],
      strongestMomentSec: moment ? Number(moment[1]) * 60 + Number(moment[2]) : null,
      domain: "unknown",
      track: null,
      tech: [],
      sourceQuotes: quotes,
    });
  }
  return out;
}

export interface PatternContext {
  winners: { title: string; sourceUrl: string | null; profile: WinnerProfile }[];
  /** Seconds into the video at which the plan reaches the demo midpoint. */
  plannedStrongestMomentSec: number | null;
  repoSignals: string[];
  pitchScript: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function heuristicPatterns(ctx: PatternContext): WinningPattern[] {
  const patterns: WinningPattern[] = [];
  const quoteOf = (w: PatternContext["winners"][number], field: string) => w.profile.sourceQuotes[field] ?? w.profile.title;

  const early = ctx.winners.filter((w) => w.profile.strongestMomentSec !== null && w.profile.strongestMomentSec <= 60);
  if (early.length >= 2) {
    const planned = ctx.plannedStrongestMomentSec;
    patterns.push({
      statement: "Winners reached their strongest demo moment within the first minute.",
      evidence: early.slice(0, 4).map((w) => ({ winnerTitle: w.profile.title, quote: quoteOf(w, "strongestMomentSec"), sourceUrl: w.sourceUrl })),
      check: "Your section plan reaches the core demo moment before 60 s.",
      checkResult: planned === null ? "unknown" : planned <= 60 ? "pass" : "fail",
      checkDetail: planned === null ? "No section plan yet." : `Your plan reaches the demo midpoint at about ${Math.round(planned)} s.`,
    });
  }

  const transformed = ctx.winners.filter((w) => w.profile.inputType !== "unknown" && w.profile.outputType !== "unknown");
  if (transformed.length >= 2) {
    const shows = /\b(into|turns?|converts?|generates?|transforms?)\b/i.test(ctx.pitchScript);
    patterns.push({
      statement: "Winners showed messy input turning into structured output.",
      evidence: transformed.slice(0, 4).map((w) => ({ winnerTitle: w.profile.title, quote: quoteOf(w, "inputType"), sourceUrl: w.sourceUrl })),
      check: "Your pitch shows a real input becoming the output on screen.",
      checkResult: ctx.pitchScript.trim() ? (shows ? "pass" : "fail") : "unknown",
      checkDetail: ctx.pitchScript.trim() ? (shows ? "The script describes an input-to-output step." : "The script never shows the transformation step.") : "No pitch script yet.",
    });
  }

  const techCount = new Map<string, PatternContext["winners"]>();
  for (const w of ctx.winners) for (const tech of w.profile.tech) techCount.set(tech, [...(techCount.get(tech) ?? []), w]);
  for (const [tech, users] of [...techCount.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (users.length < 2 || patterns.length >= 6) break;
    const found = ctx.repoSignals.some((signal) => norm(signal).includes(norm(tech)));
    patterns.push({
      statement: `${users.length} winners used ${tech}.`,
      evidence: users.slice(0, 4).map((w) => ({ winnerTitle: w.profile.title, quote: quoteOf(w, "tech"), sourceUrl: w.sourceUrl })),
      check: `Your repo uses ${tech}.`,
      checkResult: ctx.repoSignals.length === 0 ? "unknown" : found ? "pass" : "fail",
      checkDetail: ctx.repoSignals.length === 0 ? "No repo digest yet." : found ? `Detected ${tech} in the repo.` : `${tech} not detected in dependencies or code.`,
    });
  }
  return patterns.slice(0, 6);
}

const ROLE_FOCUS: Record<PersonaRole, string> = {
  technical: "how it works and the evidence behind each technical claim",
  impact: "who the user is and what measured outcome changes for them",
  product: "adoption, workflow fit and what happens when the product is wrong",
};

export function heuristicPersonaStyles(criteriaByRole: Record<PersonaRole, string[]>, difficulty: number): { role: PersonaRole; questionStyle: string }[] {
  const tone = difficulty >= 4 ? "Presses hard on" : difficulty <= 2 ? "Asks gently about" : "Asks directly about";
  return (Object.keys(ROLE_FOCUS) as PersonaRole[]).map((role) => {
    const focus = criteriaByRole[role].slice(0, 2).join(" and ");
    return { role, questionStyle: `${tone} ${ROLE_FOCUS[role]}${focus ? `, scoring ${focus}` : ""}.`.slice(0, 240) };
  });
}

export function heuristicTrack(tracks: { name: string; description: string }[], pitch: string, criteria: string[]): TrackRecommendation {
  if (tracks.length === 0) return { track: null, reasons: [] };
  const words = new Set(pitch.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const scored = tracks.map((t) => ({ t, score: (`${t.name} ${t.description}`.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { track: null, reasons: [] };
  if (tracks.length === 1) return { track: best.t.name, reasons: [{ criterion: criteria[0] ?? "Fit", reason: "It is the only track." }] };
  // No overlap means no basis for a recommendation; say nothing rather than guess.
  if (best.score === 0) return { track: null, reasons: [] };
  const shared = (`${best.t.name} ${best.t.description}`.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w));
  return {
    track: best.t.name,
    reasons: [
      {
        criterion: criteria[0] ?? "Fit",
        reason: `Your pitch shares the track's focus: ${[...new Set(shared)].slice(0, 5).join(", ")}.`,
      },
    ],
  };
}
