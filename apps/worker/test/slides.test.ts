import { snapshotNumbers, type SlideSnapshot } from "@stage-ready/shared";
import { describe, expect, it } from "vitest";
import { composeSlide, renderVerifiedSlide } from "../src/lib/slides";

const snapshot: SlideSnapshot = {
  title: "How long does generate summary take?",
  subtitle: "Measured step latency across rehearsals (3 runs of generate summary)",
  chart: {
    kind: "bar",
    unit: "s",
    series: [
      { label: "generate summary", value: 9.2 },
      { label: "load comparison", value: 0.6 },
    ],
  },
  facts: [
    { label: "Median", value: "9.2 s" },
    { label: "p95", value: "9.8 s" },
  ],
  sources: ["latency_samples: generate_summary"],
};

describe("evidence slides", () => {
  it("draws every snapshot number on the slide", async () => {
    const { text } = await composeSlide(snapshot, { withChart: true });
    const drawn = text.join(" ");
    for (const n of snapshotNumbers(snapshot)) expect(drawn).toContain(n.replace(/ s$/, ""));
  });

  it("passes when the reader finds every number", async () => {
    const out = await renderVerifiedSlide(snapshot, async (_png, text) => text.flatMap((t) => t.match(/\d[\d,.]*/g) ?? []));
    expect(out.verification).toBe("passed");
    expect(out.png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("a mismatch triggers the deterministic fallback slide", async () => {
    const out = await renderVerifiedSlide(snapshot, async () => ["9.3 s", "0.6 s", "9.8"]);
    expect(out.verification).toBe("fallback");
    expect(out.missing).toContain("9.2 s");
  });

  it("a failed reading also falls back", async () => {
    const out = await renderVerifiedSlide(snapshot, async () => {
      throw new Error("vision unavailable");
    });
    expect(out.verification).toBe("fallback");
  });
});
