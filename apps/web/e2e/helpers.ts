import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function openDemoProject(page: Page): Promise<string> {
  const response = await page.request.post("/api/demo", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const location = response.headers().location ?? "";
  expect(location).toMatch(/^\/projects\/[0-9a-f-]{36}$/);
  return location;
}

/** Zero serious or critical axe violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
