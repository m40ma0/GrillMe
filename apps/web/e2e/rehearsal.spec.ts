import { expect, test } from "@playwright/test";
import { openDemoProject } from "./helpers";

test("a Demo Mode rehearsal produces ledger chips, a contradicted speed claim and judge interruptions", async ({ page }) => {
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
  await expect(ledger.getByRole("row").filter({ hasText: "Our classifier reaches 92% accuracy." })).toContainText("Unverified", { timeout: 30_000 });
  // "The summary is instant." is said at ~8 s; the fake screen's result takes 9.2 s to appear.
  const instant = ledger.getByRole("row").filter({ hasText: "The summary is instant." });
  await expect(instant).toContainText("Contradicted", { timeout: 40_000 });
  await expect(page.getByLabel("Latency stopwatch")).toContainText(/9\.\d s|10\.\d s/);

  // At difficulty 3 the panel interrupts at least twice within three minutes, only at sentence boundaries.
  await expect.poll(() => page.getByLabel("Judge turns").getByText("Interrupt", { exact: true }).count(), { timeout: 150_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Fictional persona").first()).toBeVisible();

  await page.getByRole("button", { name: /Stop/ }).click();
  await expect(page.getByText(/Session score \d+ \/ 100/)).toBeVisible({ timeout: 30_000 });
});
