// Records the landing page's ~20 s product clip from the real app in Demo Mode, then cuts it with FFmpeg.
//
//   pnpm dev                                   # the stack, in Demo Mode (no keys needed)
//   pnpm --filter @stage-ready/web clip        # writes public/clip.mp4 and public/clip-poster.jpg
//
// Each scene is recorded in its own browser context; the script notes when the interesting state is
// on screen, then trims that span, adds a caption, and joins the scenes with short crossfades.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.CLIP_BASE_URL ?? "http://localhost:3000";
const FIXTURES = new URL("../e2e/.fixtures/", import.meta.url).pathname;
const OUT = new URL("../public/", import.meta.url).pathname;
const SIZE = { width: 1280, height: 720 };
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const work = mkdtempSync(join(tmpdir(), "stage-ready-clip-"));

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${FIXTURES}speech-bursts.wav`,
    `--use-file-for-fake-video-capture=${FIXTURES}demo-screen.y4m`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

/** Runs one scene; `mark()` notes the moment the clip should centre on. Returns the video and the cut. */
async function scene(name, caption, seconds, run) {
  const dir = join(work, name);
  mkdirSync(dir);
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE }, colorScheme: "dark", permissions: ["microphone", "camera"] });
  const page = await context.newPage();
  let markAt = null;
  await run(page, () => (markAt = Date.now()));
  await page.waitForTimeout(800);
  const video = await page.video().path();
  const closedAt = Date.now();
  await context.close();
  // The recording ends when the context closes, so time the cut back from the video's end.
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).toString().trim());
  const markInVideo = duration - (closedAt - (markAt ?? closedAt)) / 1000;
  const length = Math.min(seconds, markInVideo + 0.6);
  return { video, caption, start: Math.max(0, markInVideo + 0.6 - length), seconds: length };
}

const demo = async (page) => {
  const response = await page.request.post(`${BASE}/api/demo`, { maxRedirects: 0 });
  return `${BASE}${response.headers().location}`;
};

const scenes = [];
scenes.push(
  await scene("landing", "One click into a fictional Demo Mode project", 3.5, async (page, mark) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /Try Demo Mode/ }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    mark();
  }),
);
const project = await (async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = await demo(page);
  await context.close();
  return url;
})();
scenes.push(
  await scene("studio", "Judges interrupt; the Claim Auditor checks each claim live", 7, async (page, mark) => {
    await page.goto(`${project}/rehearse`, { waitUntil: "networkidle" });
    await page.getByRole("combobox", { name: "Video source" }).click();
    await page.getByRole("option", { name: "Camera or virtual camera" }).click();
    await page.getByRole("button", { name: /Start rehearsal/ }).click();
    await page.getByLabel("I consent to recording this session.").check();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const instant = page.getByLabel("Claim ledger").getByRole("row").filter({ hasText: "The summary is instant." });
    await instant.filter({ hasText: "Contradicted" }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    mark();
    await page.getByRole("button", { name: /Stop/ }).click();
  }),
);
for (const [name, path, caption] of [
  ["qa", "/qa-kit", "Likely questions, 20-second answers, evidence slides"],
  ["director", "/director", "The best take per section, cut into your video"],
  ["demoguard", "/demoguard", "DemoGuard watches the live demo for failures"],
]) {
  scenes.push(
    await scene(name, caption, 3.5, async (page, mark) => {
      await page.goto(`${project}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      mark();
    }),
  );
}
await browser.close();

// Trim, caption and join with 0.4 s crossfades.
const FADE = 0.4;
const inputs = scenes.flatMap((s) => ["-ss", s.start.toFixed(2), "-t", s.seconds.toFixed(2), "-i", s.video]);
const escape = (text) => text.replace(/\\/g, "\\\\").replace(/'/g, "’").replace(/:/g, "\\:");
const labelled = scenes.map(
  (s, i) =>
    `[${i}:v]fps=30,scale=${SIZE.width}:${SIZE.height},setsar=1,format=yuv420p,` +
    `drawtext=fontfile=${FONT}:text='${escape(s.caption)}':fontsize=30:fontcolor=white:box=1:boxcolor=0x0c0e14@0.78:boxborderw=18:x=(w-text_w)/2:y=h-text_h-48[s${i}]`,
);
let chain = "[s0]";
let offset = scenes[0].seconds - FADE;
const fades = scenes.slice(1).map((s, i) => {
  const out = `[x${i}]`;
  const step = `${chain}[s${i + 1}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}${out}`;
  chain = out;
  offset += s.seconds - FADE;
  return step;
});
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-y",
    ...inputs,
    "-filter_complex",
    [...labelled, ...fades].join(";"),
    "-map",
    chain,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(OUT, "clip.mp4"),
  ],
  { stdio: "inherit" },
);
// The poster is the moment the Claim Auditor contradicts "instant" in the Studio scene.
const posterAt = scenes[0].seconds - FADE + scenes[1].seconds / 2;
execFileSync("ffmpeg", ["-hide_banner", "-y", "-ss", posterAt.toFixed(2), "-i", join(OUT, "clip.mp4"), "-frames:v", "1", "-q:v", "4", join(OUT, "clip-poster.jpg")], { stdio: "inherit" });
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${OUT}clip.mp4 and ${OUT}clip-poster.jpg (${(offset + FADE).toFixed(1)} s)`);
