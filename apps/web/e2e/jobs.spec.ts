import { expect, test } from "@playwright/test";
import { openDemoProject } from "./helpers";

test("a failed repo digest says why and offers Retry, and survives a reload", async ({ page }) => {
  const base = await openDemoProject(page);
  await page.goto(`${base}/calibration`, { waitUntil: "networkidle" });
  const panel = page.getByRole("button", { name: /Read repo|Re-read repo/ });
  await page.getByLabel("Repository").fill("m40ma0/stage-ready-no-such-repo-for-e2e");
  await panel.click();
  const failure = page.getByRole("alert").filter({ hasText: "Repo digest failed" });
  await expect(failure).toBeVisible({ timeout: 60_000 });
  // The reason is GitHub's own answer in plain words: 404 for a missing repo, or 403 / 5xx when GitHub
  // rate-limits or fails (as it can from CI); never a bare "failed".
  await expect(failure).toContainText(/GitHub[^.]*\b(40\d|5\d\d)\b|not found|refused|rate limit/i);
  await expect(failure.getByRole("button", { name: /Retry/ })).toBeVisible();
  // After a reload the panel finds the failed job on the server and still shows the reason.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("alert").filter({ hasText: "Repo digest failed" })).toBeVisible({ timeout: 15_000 });
});
