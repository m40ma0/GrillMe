import { BinaryKind, dHash, encodeBinary, encodeFrame, hamming } from "@stage-ready/shared/ws-binary";

export type VideoSource = "screen" | "camera";

export interface Capture {
  video: MediaStream;
  stop(): Blob | null;
}

/**
 * Screen (or camera/virtual camera) plus mic. Audio goes out as 250 ms PCM16 chunks; frames at 2 fps,
 * skipped when their perceptual hash is unchanged. Everything is recorded locally with MediaRecorder.
 */
export async function startCapture(opts: {
  source: VideoSource;
  t0: number;
  onAudio: (chunk: Uint8Array) => void;
  onFrame: (frame: Uint8Array) => void;
  onLevel: (level: number) => void;
  fps?: number;
}): Promise<Capture> {
  const video =
    opts.source === "screen"
      ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
      : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

  const audio = new AudioContext();
  await audio.audioWorklet.addModule("/worklets/pcm16.js");
  const node = new AudioWorkletNode(audio, "pcm16");
  const source = audio.createMediaStreamSource(mic);
  source.connect(node);
  const audioStart = performance.now() - opts.t0;
  let chunk = 0;
  node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    // Timestamps come from the sample count, so audio time never drifts from the stream.
    opts.onAudio(encodeBinary(BinaryKind.audio, audioStart + chunk++ * 250, new Uint8Array(event.data.pcm)));
    opts.onLevel(event.data.level);
  };

  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.srcObject = video;
  await el.play();
  const canvas = document.createElement("canvas");
  const thumb = document.createElement("canvas");
  thumb.width = 9;
  thumb.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  const tctx = thumb.getContext("2d", { willReadFrequently: true });
  let lastHash: bigint | null = null;
  let busy = false;
  const timer = setInterval(
    () => {
      if (busy || !ctx || !tctx || el.videoWidth === 0) return;
      const ts = performance.now() - opts.t0;
      tctx.drawImage(el, 0, 0, 9, 8);
      const px = tctx.getImageData(0, 0, 9, 8).data;
      const gray = Array.from({ length: 72 }, (_, i) => 0.299 * (px[i * 4] ?? 0) + 0.587 * (px[i * 4 + 1] ?? 0) + 0.114 * (px[i * 4 + 2] ?? 0));
      const hash = dHash(gray);
      if (lastHash !== null && hamming(hash, lastHash) === 0) return;
      lastHash = hash;
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
    1000 / (opts.fps ?? 2),
  );

  // Recordings stay on this machine unless the project opts in to cloud upload.
  const recorded: Blob[] = [];
  const mixed = new MediaStream([...video.getVideoTracks(), ...mic.getAudioTracks()]);
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => e.data.size && recorded.push(e.data);
  recorder.start(1_000);

  return {
    video,
    stop() {
      clearInterval(timer);
      if (recorder.state !== "inactive") recorder.stop();
      node.port.onmessage = null;
      source.disconnect();
      void audio.close();
      for (const t of [...video.getTracks(), ...mic.getTracks()]) t.stop();
      return recorded.length ? new Blob(recorded, { type: mime ?? "video/webm" }) : null;
    },
  };
}
