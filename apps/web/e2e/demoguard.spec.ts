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

  // The dialog closes at 16 s. Recovery waits for the next step boundary, so the cut back comes when the
  // step's fallback clip ends: exactly one clip length (8 s for this fixture step) on fallback.
  await expect(state).toContainText("Live", { timeout: 20_000 });
  await expect(state).toContainText(/Time on fallback: 8\.\d s/);

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

  await page.getByRole("button", { name: "End run" }).click();
  await page.getByRole("tab", { name: "Post-mortem" }).click();
  const timeline = page.getByRole("list", { name: "Incident timeline" }).first();
  await expect(timeline).toContainText("Switched to fallback", { timeout: 10_000 });
  await expect(timeline).toContainText("Recovered to live");
  await expect(timeline).toContainText("Panic");
  await expect(timeline).toContainText("Froze");
});
