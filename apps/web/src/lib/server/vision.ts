import "server-only";
import { metaApiKey } from "@stage-ready/ai";
import { z } from "zod";
import { ApiError } from "./api";
import { env } from "./env";

const Transcript = z.object({ text: z.string(), words: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number() })), durationMs: z.number() });

/** Transcribes a short recording (a drill answer) on the vision service. */
export async function transcribeAudio(audio: ArrayBuffer, contentType: string) {
  const { VISION_SERVICE_URL, VISION_SERVICE_TOKEN } = env();
  if (!VISION_SERVICE_URL) throw new ApiError(503, "vision_not_configured", "Set VISION_SERVICE_URL to transcribe drill answers, or use Demo Mode.");
  let response: Response;
  try {
    response = await fetch(`${VISION_SERVICE_URL.replace(/\/+$/, "")}/transcribe/upload`, {
      method: "POST",
      headers: { "content-type": contentType, ...(VISION_SERVICE_TOKEN ? { authorization: `Bearer ${VISION_SERVICE_TOKEN}` } : {}) },
      body: audio,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new ApiError(503, "vision_unreachable", `Could not reach the vision service: ${(error as Error).message}`);
  }
  if (!response.ok) throw new ApiError(502, "transcription_failed", `Transcription failed (${response.status}).`);
  return Transcript.parse(await response.json());
}

/**
 * The screen tracker a rehearsal on this project will use, decided the same way as the realtime server
 * (apps/realtime/src/server.ts): hosted SAM 3.1 when MODEL_SAM and a Meta key are set (for Demo Mode, only
 * while Demo Mode runs on the real models), else the vision service's tracker if it reports SAM, else hashes.
 * Lets the Studio show the right label before the session starts.
 */
export async function expectedTracker(project: { demoMode: boolean }): Promise<"sam" | "phash"> {
  const e = env();
  const hosted = Boolean(e.MODEL_SAM && metaApiKey(e) && e.META_API_BASE_URL);
  const demoLive = !e.MODEL_MOCK && (e.DEMO_LIVE_MODELS ?? process.env.NODE_ENV === "production");
  if (hosted && (!project.demoMode || demoLive)) return "sam";
  if (!e.VISION_SERVICE_URL) return "phash";
  try {
    const response = await fetch(`${e.VISION_SERVICE_URL.replace(/\/+$/, "")}/api/health`, { signal: AbortSignal.timeout(1_500), next: { revalidate: 60 } });
    const body = (await response.json()) as { tracker?: string };
    return response.ok && body.tracker === "sam" ? "sam" : "phash";
  } catch {
    return "phash";
  }
}
