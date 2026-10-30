import { expect, test } from "@playwright/test";

const EVENT = `Wizard Jam (fictional)
Judging criteria
Impact (60%): Real users.
Craft (40%): Polish.
Videos must be under 2 minutes.
Submissions close December 1, 2026 at 5 PM PT.`;

test("setup wizard: event text becomes a quoted EventSpec, weights must total 100%, and the plan fits the limit", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("E2E Wizard");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/step=1/);
  await page.getByLabel("Or paste the event text").fill(EVENT);
  await page.getByRole("button", { name: "Read event" }).click();
  await expect(page.getByText("Confirm the EventSpec")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByLabel("Video limit (s)")).toHaveValue("120");
  await expect(page.getByText("Impact (60%): Real users.", { exact: true })).toBeVisible();
  const save = page.getByRole("button", { name: "Save and continue" });
  await page.getByLabel("Weight percent for Impact").fill("70");
  await expect(save).toBeDisabled();
  await expect(page.getByText("Weights total 110%. Adjust them to 100% to save.")).toBeVisible();
  await page.getByLabel("Weight percent for Impact").fill("60");
  await save.click();

  await page.waitForURL(/step=2/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/step=3/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/step=4/);
  await expect(page.getByText("Within limit")).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByText("2 min 0 s of 2 min 0 s.")).toBeVisible();
});
