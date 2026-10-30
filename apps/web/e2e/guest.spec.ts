import { expect, test } from "@playwright/test";

// Runs against a web server without the dev auth bypass (see playwright.config.ts), like production.

test("a signed-out visitor goes from the landing page to the Demo Mode project in one click", async ({ page, browser }) => {
  // The dev server compiles a route on its first request; warm the demo route and the project page so
  // the timing below measures the app, not the compiler.
  const warm = await browser.newContext({ baseURL: test.info().project.use.baseURL ?? "http://localhost:3100" });
  const warmed = await warm.request.post("/api/demo", { maxRedirects: 0 });
  await warm.request.get(warmed.headers().location ?? "/");
  await warm.close();
  await page.goto("/");
  await expect(page.locator("video[src='/clip.mp4']")).toBeVisible();
  const started = Date.now();
  await page.getByRole("button", { name: /Try Demo Mode/ }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Signal Garden" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);
  await expect(page.getByRole("status").filter({ hasText: "You are in a guest demo. Sign in with GitHub to keep your work." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText('{"error"');

  // Guests stay inside Demo Mode: no new projects, repo links or cloud upload.
  const create = await page.request.post("/api/projects", { data: { name: "x", tagline: "y", timezone: "UTC" } });
  expect(create.status()).toBe(403);
  expect((await create.json()).error.code).toBe("guest_forbidden");
  const projectId = page.url().split("/").pop();
  const upload = await page.request.patch(`/api/projects/${projectId}`, { data: { cloudUploadEnabled: true } });
  expect(upload.status()).toBe(403);
});

test("signed out, the workspace sends you to the branded sign-in page, which offers the guest demo", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fprojects|\/signin\?callbackUrl=\/projects/);
  await expect(page.getByRole("heading", { name: "Sign in to Stage Ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByText("Read-only repo access; Stage Ready never writes to your repo.")).toBeVisible();
  await page.getByRole("button", { name: "Try the guest demo" }).click();
  await expect(page.getByRole("heading", { name: "Signal Garden" })).toBeVisible();
});

test("a failed form post shows a page, never raw JSON", async ({ page }) => {
  const response = await page.request.post("/api/projects/not-a-project/repo", { headers: { "sec-fetch-mode": "navigate", accept: "text/html" }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toMatch(/^\/signin\?callbackUrl=/);
  await page.goto("/problem?message=That%20project%20was%20not%20found.");
  await expect(page.getByText("That project was not found.")).toBeVisible();
});

test("the app icon, favicon and web manifest are served", async ({ request }) => {
  for (const [path, type] of [
    ["/favicon.ico", "image/x-icon"],
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
    ["/icon-192.png", "image/png"],
    ["/manifest.webmanifest", "application/manifest+json"],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(type);
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Stage Ready", start_url: "/projects" });
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<link rel="icon" href="\/icon\.svg/);
});
