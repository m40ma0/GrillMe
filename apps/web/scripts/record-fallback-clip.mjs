// Records the Demo Mode golden run (scripts/golden-run.html, a scripted pass through the fictional Signal
// Garden app) and encodes it as public/demo/fallback-golden-run.mp4, the clip DemoGuard's Stage window cuts
// to in Demo Mode. No server needed.
//
//   pnpm --filter @stage-ready/web fallback-clip
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PAGE = new URL("./golden-run.html", import.meta.url).href;
const OUT = new URL("../public/demo/fallback-golden-run.mp4", import.meta.url).pathname;
const SIZE = { width: 1280, height: 720 };
const SECONDS = 60; // five 12 s steps
const work = mkdtempSync(join(tmpdir(), "stage-ready-golden-"));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: work, size: SIZE } });
const page = await context.newPage();
const openedAt = Date.now();
await page.goto(`${PAGE}?manual`);
await page.waitForLoadState("load");
const startedAt = Date.now();
await page.evaluate(() => window.startGoldenRun());
await page.waitForTimeout(SECONDS * 1000 + 500);
const video = await page.video().path();
await context.close();
await browser.close();

// Trim the page load off the front so step 1 starts at 0 s, then encode small H.264 for every browser.
const offset = Math.max(0, (startedAt - openedAt) / 1000);
mkdirSync(new URL("../public/demo/", import.meta.url).pathname, { recursive: true });
execFileSync(
  "ffmpeg",
  ["-y", "-ss", offset.toFixed(2), "-i", video, "-t", String(SECONDS), "-an", "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-movflags", "+faststart", OUT],
  { stdio: "inherit" },
);
rmSync(work, { recursive: true, force: true });
console.log(`wrote ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB)`);
