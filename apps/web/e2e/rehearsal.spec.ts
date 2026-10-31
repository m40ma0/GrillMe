import { expect, test } from "@playwright/test";
import { openDemoProject } from "./helpers";

test("a Demo Mode rehearsal: ledger chips, repo truth, show-or-strike, interruptions, then review and Coach Notes", async ({ page }) => {
  const base = await openDemoProject(page);
  await page.goto(`${base}/rehearse`, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Video source" }).click();
  await page.getByRole("option", { name: "Camera or virtual camera" }).click();
  await page.getByRole("button", { name: /Start rehearsal/ }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
  await page.getByLabel("I consent to recording this session.").check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();

  const ledger = page.getByLabel("Claim ledger");
  await expect(ledger.getByRole("row").filter({ hasText: "We use encrypted storage for every report." })).toContainText("Unverified", { timeout: 30_000 });
  // "The summary is instant." is said at ~8 s; the fake screen's result takes 9.2 s to appear.
  const instant = ledger.getByRole("row").filter({ hasText: "The summary is instant." });
  await expect(instant).toContainText("Contradicted", { timeout: 40_000 });
  // The fake result appears 9.2 s after the action; frames arrive twice a second, so allow half a second either way.
  await expect(page.getByLabel("Latency stopwatch")).toContainText(/8\.[5-9] s|9\.\d s|10\.\d s/);

  // At difficulty 3 the panel interrupts at least twice within three minutes, only at sentence boundaries.
  await expect.poll(() => page.getByLabel("Judge turns").getByText("Interrupt", { exact: true }).count(), { timeout: 150_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Fictional persona").first()).toBeVisible();
  // Every judge line and claim chip says which model produced it (mocked here: e2e runs without a key).
  await expect(page.getByLabel("Judge turns").locator("[data-model]").first()).toHaveText(/Mocked|Muse Spark/);
  await expect(ledger.locator("[data-model]").first()).toHaveText(/Mocked|Muse Spark/);

  // Repo truth: the fixture repo has a TODO for offline mode and a hard-coded 0.92.
  await expect(ledger.getByRole("row").filter({ hasText: "Signal Garden supports offline mode." })).toContainText("Contradicted");
  await expect(ledger.getByRole("row").filter({ hasText: "Our classifier reaches 92% accuracy." })).toContainText("Contradicted");

  await page.getByRole("button", { name: /Stop/ }).click();
  await expect(page.getByText(/Session score \d+ \/ 100/)).toBeVisible({ timeout: 30_000 });
  // Show or strike: features mentioned but never shown are flagged when the demo ends.
  await expect(ledger.getByRole("row").filter({ hasText: "Teams can compare the latest incident with previous reports." })).toContainText("Not shown");

  // Session review and Rehearsal Memory: after this session and the seeded earlier one, Coach Notes
  // list at least one resolved item and a three-item next plan.
  await page.getByRole("link", { name: "All sessions" }).click();
  await page.getByRole("table").getByRole("link").first().click();
  // The first visit compiles the review page on the dev server.
  await expect(page.getByRole("heading", { name: "Session review" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Resolved since last time")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Next session" }).locator("xpath=following-sibling::ol/li")).toHaveCount(3);
  await page.getByRole("tab", { name: "Claims" }).click();
  await page.getByRole("radio", { name: /Not shown/ }).click();
  await expect(page.getByRole("cell", { name: "Teams can compare the latest incident with previous reports." })).toBeVisible();
  await page.getByRole("tab", { name: "Rubric" }).click();
  await expect(page.getByRole("table", { name: /Rubric heatmap/ })).toBeVisible();
  await page.goto(`${base}/progress`);
  await expect(page.getByText("Coverage per criterion")).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
});
