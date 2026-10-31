import { describe, expect, it } from "vitest";
import { AudioRecorder, SAMPLE_RATE, mapSegments } from "../src/session/final-transcript";

describe("AudioRecorder", () => {
  it("lays chunks on the session clock and fills dropped audio with silence", () => {
    const r = new AudioRecorder();
    r.push(1_000, new Int16Array(SAMPLE_RATE / 4).fill(5)); // 250 ms at t=1 s
    r.push(3_000, new Int16Array(SAMPLE_RATE / 4).fill(7)); // after a 1.75 s gap
    expect(r.startMs).toBe(1_000);
    expect(r.durationMs).toBe(2_250);
    const pcm = r.pcm();
    expect(pcm[0]).toBe(5);
    expect(pcm[SAMPLE_RATE]).toBe(0);
    expect(pcm[pcm.length - 1]).toBe(7);
  });
});

describe("mapSegments", () => {
  it("points each live segment at the final turn it overlaps most, or the nearest", () => {
    const old = [
      { id: "a", startMs: 0, endMs: 2_000 },
      { id: "b", startMs: 2_500, endMs: 4_000 },
      { id: "c", startMs: 9_000, endMs: 9_500 },
    ];
    const next = [
      { id: "x", startMs: 0, endMs: 3_000 },
      { id: "y", startMs: 3_000, endMs: 6_000 },
    ];
    const map = mapSegments(old, next);
    expect(map.get("a")).toBe("x");
    expect(map.get("b")).toBe("y");
    expect(map.get("c")).toBe("y");
  });
});
