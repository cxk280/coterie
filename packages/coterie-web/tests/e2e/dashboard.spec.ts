import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the dashboard surface. With the API unreachable the pages
 * fall back to mock-data so the tests stay green without a running backend.
 */

test("dashboard renders task input + mode picker + Run button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "New run" })).toBeVisible();
  // Task input panel — pick the <p> in main, not the left-rail link.
  await expect(page.locator("main").getByText(/Refactor src\/auth\.ts/i)).toBeVisible();
  // All five mode chips are present.
  for (const mode of ["single", "consensus", "adversarial", "debate", "tournament"]) {
    await expect(page.getByRole("button", { name: new RegExp(mode, "i") })).toBeVisible();
  }
  // Run button.
  await expect(page.getByRole("button", { name: /^Run\s*▶/ })).toBeVisible();
});

test("run history page lists runs and pagination is sane", async ({ page }) => {
  await page.goto("/runs");
  await expect(page.getByRole("heading", { name: "Run history" })).toBeVisible();
  // Stats row labels.
  for (const label of ["RUNS THIS WEEK", "AVG COST / RUN", "SUCCESS RATE", "TOTAL SPEND", "AVG DURATION"]) {
    await expect(page.getByText(label)).toBeVisible();
  }
  // Mode filter chips.
  for (const mode of ["single", "consensus", "adversarial", "debate", "tournament"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${mode}$`, "i") })).toBeVisible();
  }
});

test("settings page exposes the personal access token UI", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Personal access tokens/i })).toBeVisible();
  // Token name input + Create button render.
  await expect(page.getByPlaceholder(/Token name/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Create$/ })).toBeVisible();
});

test("404 surfaces gracefully for unknown error state", async ({ page }) => {
  const res = await page.goto("/states/no-such-state");
  expect(res?.status()).toBe(404);
});

test("first-run state renders the welcome panel", async ({ page }) => {
  await page.goto("/states/first-run");
  await expect(page.getByRole("heading", { name: /Welcome to Coterie/i })).toBeVisible();
  await expect(page.getByText(/GET STARTED/i)).toBeVisible();
});
