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
  // GitHub answers 404 for a missing repo, or 403 when it rate-limits unauthenticated reads: either way a readable reason.
  await expect(failure).toContainText(/not found|404|could not|refused|403|rate limit/i);
  await expect(failure.getByRole("button", { name: /Retry/ })).toBeVisible();
  // After a reload the panel finds the failed job on the server and still shows the reason.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("alert").filter({ hasText: "Repo digest failed" })).toBeVisible({ timeout: 15_000 });
});
