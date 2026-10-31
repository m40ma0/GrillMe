import { expect, test } from "@playwright/test";
import { expectAccessible, openDemoProject } from "./helpers";

test("Q&A Kit: ranked questions, capped scripts, verified slides, drill and the Cmd+K finder", async ({ page }) => {
  const base = await openDemoProject(page);
  await page.goto(`${base}/qa-kit`, { waitUntil: "networkidle" });
  const rows = page.getByRole("table").getByRole("row");
  await expect.poll(() => rows.count()).toBeGreaterThan(20); // header + at least 20 questions
  await expect(page.getByText(/\d+ \/ 55 words/)).toBeVisible();
  const count = await page.getByText(/(\d+) \/ 55 words/).textContent();
  expect(Number(count?.split(" ")[0])).toBeLessThanOrEqual(55);

  // Rebuild renders and verifies every slide, then the PDF appendix.
  await page.getByRole("button", { name: "Rebuild questions" }).click();
  await expect(page.getByText("Rebuilding questions and slides")).toBeVisible();
  await expect(page.getByText("Numbers verified")).toBeVisible({ timeout: 120_000 });
  // Muse Wonder writes the pre-pitch brief in the same call (mocked here: e2e runs without a key).
  await expect(page.getByText("Pre-pitch brief")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Evidence slide:/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export PDF" })).toBeVisible();
  await expectAccessible(page);

  // Drill: a strong fixture answer is scored on length, directness and evidence.
  await page.getByRole("button", { name: "Start drill" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Play a strong answer" }).click();
  // The dev server compiles the drill route on its first request, which can take over 10 s.
  await expect(page.getByRole("button", { name: "Next question" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Directness")).toBeVisible();
  await page.getByRole("button", { name: "End drill" }).click();

  // Cmd+K: the backup slide is on screen in under 2 s.
  const question = (await rows.nth(1).getByRole("button").textContent())?.trim() ?? "";
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Type a command or search").fill(question.slice(0, 30));
  const started = Date.now();
  await page
    .getByRole("option", { name: question.slice(0, 30) })
    .first()
    .click();
  const slide = page.getByRole("img", { name: /^Backup slide:/ });
  await expect(slide).toBeVisible();
  await expect.poll(() => slide.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(Date.now() - started).toBeLessThan(2_000);
});
