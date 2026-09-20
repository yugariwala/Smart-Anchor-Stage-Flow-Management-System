import { defineConfig } from "@playwright/test";

/**
 * `CUEPILOT_E2E_URL` points the suite at an already-running target — a deployed build, or
 * servers you started yourself. Without it the suite starts both servers itself, so
 * `npm run test:e2e` works from a clean checkout.
 *
 * The Worker still needs `apps/api/.dev.vars` (copy `.dev.vars.example`): the e2e signs in
 * with a real Firebase identity and the Worker verifies that token for real, so there is
 * no credential-free path to a green run.
 */
const target = process.env.CUEPILOT_E2E_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    baseURL: target ?? "http://localhost:5173",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
    video: process.env.CUEPILOT_E2E_VIDEO === "1" ? "on" : "off",
  },
  ...(target
    ? {}
    : {
        webServer: [
          {
            command: "npm run dev:api",
            url: "http://127.0.0.1:8787/v1/health",
            cwd: "../..",
            reuseExistingServer: true,
            timeout: 120_000,
            stdout: "pipe",
            stderr: "pipe",
          },
          {
            command: "npm run dev -- --port 5173 --strictPort",
            url: "http://localhost:5173",
            cwd: ".",
            reuseExistingServer: true,
            timeout: 120_000,
            stdout: "pipe",
            stderr: "pipe",
          },
        ],
      }),
});
