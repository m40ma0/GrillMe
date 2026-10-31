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
  await page.getByRole("link", { name: /Try Demo Mode/ }).click();
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

test("Try Demo Mode paints a progress page at once, and a returning guest reuses their project", async ({ page }) => {
  await page.goto("/demo/starting");
  await expect(page.getByRole("heading", { name: "Setting up your demo project…" })).toBeVisible();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const first = page.url();
  // Same browser, same guest cookie: no second seed, same project, and no guest allowance used.
  const again = await page.request.post("/api/demo", { headers: { accept: "application/json" } });
  expect(again.status()).toBe(200);
  expect(first.endsWith((await again.json()).location)).toBe(true);
});

test("signed out, the workspace sends you to the branded sign-in page, which offers the guest demo", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fprojects|\/signin\?callbackUrl=\/projects/);
  await expect(page.getByRole("heading", { name: "Sign in to Stage Ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByText("Read-only repo access; Stage Ready never writes to your repo.")).toBeVisible();
  await page.getByRole("link", { name: "Try the guest demo" }).click();
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

test("a rehearsal whose screen capture is blocked leaves no session behind", async ({ page }) => {
  // This project runs without fake media devices, so the browser refuses screen capture.
  await page.goto("/");
  await page.getByRole("link", { name: /Try Demo Mode/ }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const base = new URL(page.url()).pathname;
  await page.goto(`${base}/sessions`);
  const before = await page.getByRole("table").getByRole("row").count();
  await page.goto(`${base}/rehearse`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Start rehearsal/ }).click();
  await page.getByLabel("I consent to recording this session.").check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText(/blocked|Permission denied|not allowed|NotAllowed|not supported/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto(`${base}/sessions`);
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(before);
});
