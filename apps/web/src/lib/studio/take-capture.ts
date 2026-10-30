/** One Director take: screen with an optional camera picture-in-picture and the mic, recorded locally as WebM. */
export interface TakeCapture {
  preview: MediaStream;
  stop(): Promise<{ blob: Blob; durationMs: number }>;
  cancel(): void;
}

export async function startTakeCapture(opts: { camera: boolean }): Promise<TakeCapture> {
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: 1920, height: 1080 }, audio: false });
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const cam = opts.camera ? await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false }).catch(() => null) : null;
  const all = [screen, mic, ...(cam ? [cam] : [])];

  const play = async (stream: MediaStream) => {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.srcObject = stream;
    await el.play();
    return el;
  };
  const screenEl = await play(screen);
  const camEl = cam ? await play(cam) : null;
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  let raf = 0;
  const draw = () => {
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / (screenEl.videoWidth || 1), canvas.height / (screenEl.videoHeight || 1));
      const w = (screenEl.videoWidth || 0) * scale;
      const h = (screenEl.videoHeight || 0) * scale;
      ctx.drawImage(screenEl, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      if (camEl && camEl.videoWidth) ctx.drawImage(camEl, canvas.width - 480 - 32, canvas.height - 270 - 32, 480, 270);
    }
    raf = requestAnimationFrame(draw);
  };
  draw();

  const out = canvas.captureStream(30);
  for (const track of mic.getAudioTracks()) out.addTrack(track);
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const recorder = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const started = performance.now();
  recorder.start(1_000);

  const release = () => {
    cancelAnimationFrame(raf);
    for (const s of all) s.getTracks().forEach((t) => t.stop());
    out.getTracks().forEach((t) => t.stop());
  };
  return {
    preview: out,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: "video/webm" }), durationMs: Math.round(performance.now() - started) });
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      recorder.stop();
    },
  };
}
