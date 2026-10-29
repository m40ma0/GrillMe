import "server-only";
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
