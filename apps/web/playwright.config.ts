import { defineConfig, devices } from "@playwright/test";

const fixtures = `${__dirname}/e2e/.fixtures`;

// Runs against `pnpm dev` (or an already running stack) in Demo Mode: no API keys, scripted speech,
// fake camera and mic from generated fixtures (see e2e/global-setup.ts).
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
    permissions: ["microphone", "camera"],
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-audio-capture=${fixtures}/speech-bursts.wav`,
            `--use-file-for-fake-video-capture=${fixtures}/demo-screen.y4m`,
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
  ...(process.env.E2E_BASE_URL
    ? {}
    : { webServer: { command: "pnpm --dir ../.. dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 180_000, stdout: "ignore" as const, stderr: "pipe" as const } }),
});
