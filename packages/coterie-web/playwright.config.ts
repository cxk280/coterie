import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for coterie-web smoke tests.
 *
 * Tests run against port 3100 by default to avoid clashing with whatever
 * dev server might be on the conventional 3000. Override with PW_BASE_URL
 * if you want to point at something else. PW_USE_WEBSERVER=1 makes
 * Playwright auto-start `npm run dev` on port 3100; otherwise bring your
 * own server.
 */
const PORT = Number(process.env.PW_PORT ?? 3100);
const BASE_URL = process.env.PW_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  ...(process.env.PW_USE_WEBSERVER === "1"
    ? {
        webServer: {
          command: `next dev --port ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }
    : {}),
});
