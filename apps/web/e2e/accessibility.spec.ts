import { test } from "@playwright/test";
import { expectAccessible, openDemoProject } from "./helpers";

for (const scheme of ["dark", "light"] as const) {
  test(`every screen has no serious axe violations (${scheme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), scheme);
    const base = await openDemoProject(page);
    for (const path of [
      "/",
      "/projects",
      "/projects/new",
      base,
      `${base}/calibration`,
      `${base}/rehearse`,
      `${base}/sessions`,
      `${base}/qa-kit`,
      `${base}/director`,
      `${base}/demoguard`,
      `${base}/progress`,
    ]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectAccessible(page);
    }
  });
}
