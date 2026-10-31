import type { Ai } from "@stage-ready/ai";
import type { JobContext } from "./context";

export interface Artwork {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** The Muse Image model that painted it, for the on-slide caption. */
  modelId: string;
}

const mimeOf = (bytes: Uint8Array) => (bytes[0] === 0x89 ? "image/png" : "image/jpeg");

/**
 * One Muse Image background, generated once and cached in storage under `key`. Demo Mode projects share
 * one key, since their fixtures are identical: every guest sees generated art for one image's cost.
 * Null when there is no image model, or the call fails (callers fall back to plain backgrounds).
 */
export async function cachedArtwork(ctx: JobContext, ai: Ai, key: string, prompt: string): Promise<Artwork | null> {
  if (!ai.image) return null;
  const modelId = ai.image.modelId;
  const cached = await ctx.storage.getJson<{ modelId: string }>(`${key}.json`);
  if (cached) {
    const bytes = await ctx.storage.get(ctx.storage.uri(key));
    if (bytes?.length) return { bytes, mime: mimeOf(bytes), modelId: cached.modelId };
  }
  try {
    const bytes = await ai.image.generate({ prompt });
    await ctx.storage.put(key, bytes, mimeOf(bytes));
    await ctx.storage.putJson(`${key}.json`, { modelId, createdAt: new Date().toISOString() });
    return { bytes, mime: mimeOf(bytes), modelId };
  } catch (error) {
    ctx.logger.warn({ err: error, key }, "Muse Image artwork failed; using a plain background");
    return null;
  }
}

/** "muse-image-1.0" → "Muse Image 1.0" for captions. */
export const modelName = (id: string) =>
  id
    .split("-")
    .map((p) => (/^\d/.test(p) ? p : p[0]!.toUpperCase() + p.slice(1)))
    .join(" ");
