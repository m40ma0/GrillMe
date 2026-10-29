import { z } from "zod";
import type { Prompt } from "../types";

export const SlideReading = z.object({ numbers: z.array(z.string().max(40)).max(60) });
export type SlideReading = z.infer<typeof SlideReading>;

/**
 * Verification pass: Muse Spark reads the rendered slide and lists every number it shows.
 * The caller compares them with the slide's dataSnapshot. `renderedText` is only used by
 * the mocked adapter (it stands in for a perfect reader); it is never sent to the model.
 */
export function slideVerifyV1(input: { png: Uint8Array; renderedText: string[] }): Prompt<SlideReading> {
  return {
    id: "slideVerify",
    version: 1,
    model: "spark",
    schema: SlideReading,
    images: [input.png],
    system: "Read the slide image. List every number that appears on it exactly as printed, including units and percent signs. Do not infer or compute numbers.",
    user: "List the numbers on this slide.",
    mock: () => ({ numbers: input.renderedText.flatMap((t) => t.match(/\d[\d,.]*\s*(?:%|s|ms)?/g) ?? []).map((n) => n.trim()) }),
  };
}
