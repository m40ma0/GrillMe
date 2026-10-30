import { dHash, encodeFrame, hamming } from "@stage-ready/shared/ws-binary";

export interface FrameCapture {
  video: MediaStream;
  stop(): void;
}

/**
 * DemoGuard capture: frames only, 4 fps, no audio and no recording. Unchanged frames are skipped,
 * except one per second, so the server still sees a screen that stays blank or has recovered.
 */
export async function startFrameCapture(opts: { source: "screen" | "camera"; t0: number; onFrame: (frame: Uint8Array) => void; fps?: number; onEnded?: () => void }): Promise<FrameCapture> {
  const video =
    opts.source === "screen"
      ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
      : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
  video.getVideoTracks()[0]?.addEventListener("ended", () => opts.onEnded?.());
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.srcObject = video;
  await el.play();
  const canvas = document.createElement("canvas");
  const thumb = document.createElement("canvas");
  thumb.width = 9;
  thumb.height = 8;
  const ctx = canvas.getContext("2d");
  const tctx = thumb.getContext("2d", { willReadFrequently: true });
  let lastHash: bigint | null = null;
  let lastSent = 0;
  let busy = false;
  const timer = setInterval(
    () => {
      if (busy || !ctx || !tctx || el.videoWidth === 0) return;
      const ts = performance.now() - opts.t0;
      tctx.drawImage(el, 0, 0, 9, 8);
      const px = tctx.getImageData(0, 0, 9, 8).data;
      const hash = dHash(Array.from({ length: 72 }, (_, i) => 0.299 * (px[i * 4] ?? 0) + 0.587 * (px[i * 4 + 1] ?? 0) + 0.114 * (px[i * 4 + 2] ?? 0)));
      if (lastHash !== null && hamming(hash, lastHash) === 0 && ts - lastSent < 1_000) return;
      lastHash = hash;
      lastSent = ts;
      const scale = Math.min(1, 960 / el.videoWidth);
      canvas.width = Math.round(el.videoWidth * scale);
      canvas.height = Math.round(el.videoHeight * scale);
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      busy = true;
      canvas.toBlob(
        (blob) => {
          busy = false;
          if (blob) void blob.arrayBuffer().then((buf) => opts.onFrame(encodeFrame(ts, hash, new Uint8Array(buf))));
        },
        "image/jpeg",
        0.7,
      );
    },
    1000 / (opts.fps ?? 4),
  );
  return {
    video,
    stop() {
      clearInterval(timer);
      video.getTracks().forEach((t) => t.stop());
    },
  };
}

/** What the Live control window tells the cue window (same browser, second monitor). */
export interface CueMessage {
  state: string;
  step: { index: number; name: string; narration: string } | null;
  next: { name: string } | null;
  total: number;
  fallbackSeekMs: number | null;
  /** Whether the Recorded-segment badge shows during fallback. */
  badgeVisible: boolean;
}

/** What the Stage window asks of the Live control window. */
export type StageRequest = { type: "stage.test" };

export const cueChannel = (projectId: string) => `stage-ready-cue-${projectId}`;
