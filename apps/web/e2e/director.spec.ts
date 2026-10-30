import { expect, test } from "@playwright/test";
import { expectAccessible, openDemoProject } from "./helpers";

interface Director {
  limitSec: number;
  takes: { id: string; sectionKey: string; score: { total: number } | null }[];
  edl: { id: string; items: { takeId: string; sectionKey: string; inMs: number; outMs: number; transition: string }[]; totalMs: number; fits: boolean } | null;
  firstTwenty: { ok: boolean } | null;
}

test("Director: auto-EDL from 12 fixture takes, First-20-seconds warning, render with exports", async ({ page }) => {
  const base = await openDemoProject(page);
  const projectId = base.split("/").pop() ?? "";
  await page.goto(`${base}/director`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Best-Take Director" })).toBeVisible();
  await expectAccessible(page);

  // Auto-assemble picks the highest-scoring valid take per section and fits within 180 s.
  await page.getByRole("button", { name: "Auto-assemble" }).first().click();
  await expect(page.getByText(/^Assembled/)).toBeVisible();
  await expect(page.getByText("Fits the limit")).toBeVisible();
  const d = (await (await page.request.get(`/api/projects/${projectId}/director`)).json()) as Director;
  expect(d.takes).toHaveLength(12);
  expect(d.edl?.fits).toBe(true);
  expect(d.edl?.totalMs).toBeLessThanOrEqual(180_000);
  for (const item of d.edl?.items ?? []) {
    const best = d.takes.filter((t) => t.sectionKey === item.sectionKey).sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))[0];
    expect(item.takeId).toBe(best?.id);
  }
  await expect(page.getByText("The Hook take shows it.")).toBeVisible();

  // Swapping in the weak Hook take raises the First-20-seconds warning.
  const hookCards = page.locator("[data-take-id]");
  await hookCards.getByRole("button", { name: "Use this take" }).first().click();
  await page.getByRole("button", { name: "Save timeline" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "does not show the strongest moment" })).toBeVisible();

  // Render a short cut of the fixture takes (trimmed to 2 s each to keep CI fast).
  await page.getByRole("button", { name: "Auto-assemble" }).first().click();
  await expect(page.getByText(/^Assembled/).first()).toBeVisible();
  const fresh = (await (await page.request.get(`/api/projects/${projectId}/director`)).json()) as Director;
  const items = (fresh.edl?.items ?? []).map((i) => ({ ...i, inMs: 0, outMs: 2_000 }));
  expect((await page.request.patch(`/api/edls/${fresh.edl?.id}`, { data: { items } })).ok()).toBe(true);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Render video" }).click();
  await expect(page.getByRole("link", { name: /Video/ })).toBeVisible({ timeout: 180_000 });
  for (const kind of ["mp4", "srt", "thumbnail", "chapters"]) {
    const link = page.locator(`a[href$="kind=${kind}"]`).first();
    const res = await page.request.get((await link.getAttribute("href")) ?? "");
    expect(res.status(), kind).toBe(200);
    if (kind === "srt") expect(await res.text()).toMatch(/^1\n00:00:0\d,\d{3} --> /);
    if (kind === "chapters") expect(await res.text()).toContain("0:00 Intro");
  }
});
