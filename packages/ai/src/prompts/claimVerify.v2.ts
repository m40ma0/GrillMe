import type { ClaimVerdict } from "@stage-ready/shared";
import type { Prompt } from "../types";
import { claimVerifyV1, type VerifyContext } from "./claimVerify.v1";

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/** v1 plus vision: the two shared-screen frames nearest the claim go to Muse Spark as images. */
export function claimVerifyV2(ctx: Omit<VerifyContext, "frames"> & { images: { atMs: number; jpeg: Uint8Array }[] }): Prompt<ClaimVerdict> {
  const images = [...ctx.images].sort((a, b) => a.atMs - b.atMs).slice(0, 2);
  const v1 = claimVerifyV1({ ...ctx, frames: images.map((f, i) => ({ atMs: f.atMs, description: `attached image ${i + 1}` })) });
  return {
    ...v1,
    version: 2,
    system: [
      v1.system,
      "The attached images are the shared screen nearest the claim, in time order. Use what they show as evidence and cite it as frame:<m:ss>.",
      images.length ? `Image times: ${images.map((f, i) => `image ${i + 1} = frame:${mmss(f.atMs)}`).join(", ")}.` : "No screenshots are attached.",
    ].join("\n"),
    images: images.map((f) => f.jpeg),
  };
}
