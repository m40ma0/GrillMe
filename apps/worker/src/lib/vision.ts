import type { WorkerEnv } from "@stage-ready/config";
import { z } from "zod";
import { UserFacingError } from "./context";

const Transcript = z.object({ text: z.string(), words: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number() })), durationMs: z.number() });
const RenderStatus = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "done", "failed"]),
  progress: z.number(),
  step: z.string(),
  error: z.string().nullable(),
  durationMs: z.number().nullable(),
  loudnessLufs: z.number().nullable(),
});
export type RenderStatus = z.infer<typeof RenderStatus>;

export interface RenderRequest {
  clips: { source: string; inMs: number; outMs: number; chapter: string; transition: "crossfade" | "cut" }[];
  captions: { startMs: number; endMs: number; text: string }[];
  intro: { title: string; subtitle: string; background?: string };
  outro: { title: string; subtitle: string; background?: string };
  crossfadeMs: number;
  cardMs: number;
  preset: string;
  outputs: { mp4: string; thumbnail: string };
}

/** Client for the vision and media service (services/vision). */
export function visionClient(env: Pick<WorkerEnv, "VISION_SERVICE_URL" | "VISION_SERVICE_TOKEN">) {
  const base = env.VISION_SERVICE_URL?.replace(/\/+$/, "");
  const headers = { "content-type": "application/json", ...(env.VISION_SERVICE_TOKEN ? { authorization: `Bearer ${env.VISION_SERVICE_TOKEN}` } : {}) };
  const call = async <T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> => {
    if (!base) throw new UserFacingError("VISION_SERVICE_URL is not set, so takes cannot be transcribed or rendered. Start services/vision and set it in .env.");
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new UserFacingError(`Could not reach the vision service at ${base}: ${(error as Error).message}`);
    }
    if (!response.ok) {
      const detail = await response.json().then(
        (b: { detail?: unknown }) => String(b.detail ?? ""),
        () => "",
      );
      throw new UserFacingError(`The vision service returned ${response.status}${detail ? `: ${detail}` : "."}`);
    }
    return schema.parse(await response.json());
  };
  return {
    configured: Boolean(base),
    transcribe: (source: string) => call("/transcribe", Transcript, { method: "POST", body: JSON.stringify({ source }) }, 600_000),
    startRender: (req: RenderRequest) => call("/render", RenderStatus, { method: "POST", body: JSON.stringify(req) }),
    renderStatus: (id: string) => call(`/render/${id}`, RenderStatus),
  };
}
