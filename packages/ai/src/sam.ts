import type { UiRegion } from "@stage-ready/shared";
import { AiError } from "./types";

// SAM 3.1 hosted on the Meta Model API: POST {base}/responses with model "sam-3.1", one short noun
// phrase plus one image. The answer is special-token text in the output_text lane, one line per frame:
//   <0f>0<|box;x1=..;y1=..;x2=..;y2=..;w=W;h=H[;c=conf]|><|mask;x=0;y=0[;c=conf];data=H,W,~payload|>,1<|box;...|><|mask;...|>
// Only the boxes are needed here; mask payloads (base85) are skipped. Zero matches is an empty lane.

export interface SamBox {
  frame: number;
  objectId: number;
  /** Source pixels. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Source frame size, repeated on every record. */
  width: number;
  height: number;
  /** Present only when the request asked for confidence. */
  confidence: number | null;
}

const FRAME = /^<(\d+)f>/;
// An object id followed by its box token. Mask payloads never contain "<|box;", so a global scan is safe.
const RECORD = /(\d+)<\|box;([^|]*)\|>/g;

/** Parses SAM output text into boxes, keyed by frame and object id. Fields are read by key, so `c` may or may not be present. */
export function parseSamOutput(text: string): SamBox[] {
  const out: SamBox[] = [];
  for (const line of text.split("\n")) {
    const frame = FRAME.exec(line.trim());
    if (!frame) continue;
    for (const match of line.matchAll(RECORD)) {
      const fields = Object.fromEntries((match[2] ?? "").split(";").map((kv) => kv.split("=") as [string, string]));
      const num = (k: string) => Number(fields[k]);
      if (![num("x1"), num("y1"), num("x2"), num("y2"), num("w"), num("h")].every(Number.isFinite)) continue;
      out.push({
        frame: Number(frame[1]),
        objectId: Number(match[1]),
        x1: num("x1"),
        y1: num("y1"),
        x2: num("x2"),
        y2: num("y2"),
        width: num("w"),
        height: num("h"),
        confidence: fields.c === undefined ? null : Number(fields.c),
      });
    }
  }
  return out;
}

/** The phrase SAM is asked for, per UI label. One concept per request. */
export const SAM_PHRASES: Partial<Record<UiRegion["label"], string>> = {
  error_dialog: "error dialog",
  spinner: "loading spinner",
  progress_bar: "progress bar",
};

/** Boxes from SAM as UI regions: normalised 0–1, a score (1 when confidence was not returned). */
export function toRegions(label: UiRegion["label"], boxes: SamBox[]): UiRegion[] {
  return boxes
    .filter((b) => b.width > 0 && b.height > 0)
    .map((b) => ({
      label,
      box: [Math.max(0, b.x1 / b.width), Math.max(0, b.y1 / b.height), Math.min(1, b.x2 / b.width), Math.min(1, b.y2 / b.height)] as [number, number, number, number],
      score: b.confidence ?? 1,
    }));
}

interface ResponsesBody {
  output_text?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
}

/** One segmentation request: one phrase, one image (PNG or JPEG bytes). */
export async function samSegment(config: { baseUrl: string; apiKey: string; model: string }, phrase: string, image: Uint8Array, signal?: AbortSignal): Promise<SamBox[]> {
  const mime = image[0] === 0x89 && image[1] === 0x50 ? "image/png" : "image/jpeg";
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: phrase },
              { type: "input_image", image_url: `data:${mime};base64,${Buffer.from(image).toString("base64")}` },
            ],
          },
        ],
        // Smallest mask payloads; boxes and masks carry confidence.
        metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new AiError("unavailable", `Could not reach SAM on the Meta Model API: ${(error as Error).message}`);
  }
  if (!response.ok) throw new AiError("http_error", `SAM returned ${response.status}.`, (await response.text()).slice(0, 300));
  const body = (await response.json()) as ResponsesBody;
  const text =
    body.output_text ??
    (body.output ?? [])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
  return parseSamOutput(text);
}
