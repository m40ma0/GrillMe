import { expect, test } from "@playwright/test";
import { expectAccessible, openDemoProject } from "./helpers";

test("DemoGuard: pre-flight gates Arm, an injected error dialog switches within 1.5 s, recovery at the step boundary, hotkeys, post-mortem", async ({ page, context }) => {
  const base = await openDemoProject(page);
  await page.goto(`${base}/demoguard`, { waitUntil: "networkidle" });
  await expectAccessible(page);

  // The cue window follows along in its own window.
  const cue = await context.newPage();
  await cue.goto(`${base}/demoguard/cue`, { waitUntil: "networkidle" });
  await expect(cue.getByText("DemoGuard is not armed.")).toBeVisible();

  // The Stage window is what the presenter shares; it plays the golden-run clip on fallback.
  const stage = await context.newPage();
  await stage.goto(`${base}/demoguard/stage`, { waitUntil: "networkidle" });
  await stage.getByLabel("Load fallback clip").setInputFiles(`${__dirname}/.fixtures/golden-run.webm`);
  await expect(stage.getByText("· golden-run.webm")).toBeVisible();
  await expect(stage.getByTestId("fallback-clip-status")).toHaveText("ready");
  const stageRoot = stage.getByRole("main", { name: "Stage" });

  await page.bringToFront();
  await page.getByRole("tab", { name: "Pre-flight" }).click();
  await page.getByRole("combobox", { name: "Demo screen" }).click();
  await page.getByRole("option", { name: "Camera or virtual camera" }).click();
  const start = page.getByRole("button", { name: "Start pre-flight" });
  await expect(start).toBeDisabled();
  await page.getByLabel("I consent to DemoGuard analysing my shared screen.").check();
  await start.click();

  const arm = page.getByRole("button", { name: "Arm" });
  await expect(page.getByText("All critical checks pass")).toBeVisible();
  await expect(page.getByText("Companion connected")).toBeVisible();
  await expect(arm).toBeEnabled();
  await expectAccessible(page);
  await arm.click();

  const state = page.getByRole("status", { name: "DemoGuard state" });
  await expect(state).toContainText("Live", { timeout: 15_000 });
  await expect(cue.getByText(/Step \d of 5/)).toBeVisible();

  // The red error dialog appears at 12 s of the fake screen.
  await expect(state).toContainText("Fallback", { timeout: 20_000 });
  await expect(page.getByText("Error dialog or toast").first()).toBeVisible();
  const detected = await page.getByText(/Detected and switched \d+ ms/).textContent();
  expect(Number(detected?.match(/(\d+) ms/)?.[1])).toBeLessThan(1_500);
  await expect(page.getByText(/with the Recorded segment badge/)).toBeVisible();
  await expect(cue.getByText("On fallback. Keep narrating this step.")).toBeVisible();
  // The Stage window has crossfaded to the clip, at the step's in-point, with the badge.
  await expect(stageRoot).toHaveAttribute("data-state", "fallback", { timeout: 1_500 });
  await expect(stage.getByRole("status").filter({ hasText: "Recorded segment" })).toBeVisible();
  const cued = await page.getByText(/The fallback clip is cued to/).textContent();
  const seekSec = Number(cued?.match(/cued to (\d+(?:\.\d+)?) s/)?.[1] ?? NaN);
  await expect.poll(() => stage.getByTestId("fallback-clip").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(seekSec - 0.3);
  expect(await stage.getByTestId("fallback-clip").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(seekSec + 3);

  // The dialog closes at 16 s. Recovery waits for the next step boundary, so the cut back comes when the
  // step's fallback clip ends: exactly one clip length (8 s for this fixture step) on fallback.
  await expect(state).toContainText("Live", { timeout: 20_000 });
  await expect(state).toContainText(/Time on fallback: 8\.\d s/);
  await expect(stageRoot).toHaveAttribute("data-state", "live");

  // Hotkeys.
  await page.keyboard.press("Shift+P");
  await expect(state).toContainText("Fallback");
  await page.keyboard.press("Shift+R");
  await expect(state).toContainText("Live");
  await page.keyboard.press("Shift+F");
  await expect(state).toContainText("Frozen");
  await page.keyboard.press("Shift+R");
  await expect(state).toContainText("Live");
  await expectAccessible(page);

  // "Test the safety net" on the Stage window: a fake error dialog and a real switch.
  await stage.getByRole("button", { name: "Test the safety net" }).click();
  await expect(state).toContainText("Fallback", { timeout: 5_000 });
  await expect(page.getByText("Test of the safety net: an injected error dialog.").first()).toBeVisible();
  await page.keyboard.press("Shift+R");
  await expect(state).toContainText("Live");

  await page.getByRole("button", { name: "End run" }).click();
  await page.getByRole("tab", { name: "Post-mortem" }).click();
  const timeline = page.getByRole("list", { name: "Incident timeline" }).first();
  await expect(timeline).toContainText("Switched to fallback", { timeout: 10_000 });
  await expect(timeline).toContainText("Recovered to live");
  await expect(timeline).toContainText("Panic");
  await expect(timeline).toContainText("Froze");
});
