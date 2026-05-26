import { expect, test, type Page } from "@playwright/test";

/**
 * Interaction tests for the settings surface. The API is mocked with
 * `page.route` so these exercise the real frontend logic (input → request →
 * rendered result) without a running backend.
 */

function card(page: Page, provider: string) {
  return page.locator("article").filter({ has: page.getByRole("heading", { name: provider }) });
}

test.describe("provider key Test button", () => {
  test("a valid key shows a success result", async ({ page }) => {
    await page.route("**/api/auth/tokens", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/auth/providers/test", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, detail: "key is valid" }),
      }),
    );

    await page.goto("/settings");
    const anthropic = card(page, "Anthropic");
    await anthropic.getByPlaceholder(/Paste/).fill("sk-ant-test");
    await anthropic.getByRole("button", { name: /^Test$/ }).click();
    await expect(anthropic.getByRole("status")).toContainText("key is valid");
  });

  test("an invalid key surfaces the failure detail", async ({ page }) => {
    await page.route("**/api/auth/tokens", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/auth/providers/test", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, detail: "authentication failed — check the key" }),
      }),
    );

    await page.goto("/settings");
    const openai = card(page, "OpenAI");
    await openai.getByPlaceholder(/Paste/).fill("bad-key");
    await openai.getByRole("button", { name: /^Test$/ }).click();
    await expect(openai.getByRole("status")).toContainText("authentication failed");
  });

  test("Test is disabled until a key is entered", async ({ page }) => {
    await page.route("**/api/auth/tokens", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto("/settings");
    const groq = card(page, "Groq");
    await expect(groq.getByRole("button", { name: /^Test$/ })).toBeDisabled();
    await groq.getByPlaceholder(/Paste/).fill("gsk-x");
    await expect(groq.getByRole("button", { name: /^Test$/ })).toBeEnabled();
  });
});

test.describe("personal access tokens", () => {
  test("create reveals the secret once, then revoke marks it revoked", async ({ page }) => {
    const SECRET = "ck_live_TESTSECRET123";
    const tokens: Array<Record<string, unknown>> = [];

    await page.route("**/api/auth/tokens", (r) => {
      if (r.request().method() === "POST") {
        tokens.push({
          id: "tok_1",
          name: "ci-runner",
          prefix: "ck_live",
          created_at: "2026-05-26T00:00:00Z",
          last_used_at: null,
          revoked: false,
        });
        return r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "tok_1",
            name: "ci-runner",
            prefix: "ck_live",
            token: SECRET,
            created_at: "2026-05-26T00:00:00Z",
          }),
        });
      }
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tokens) });
    });
    await page.route("**/api/auth/tokens/*", (r) => {
      for (const t of tokens) t.revoked = true;
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "revoked", id: "tok_1" }),
      });
    });
    page.on("dialog", (d) => d.accept());

    await page.goto("/settings");
    await page.getByPlaceholder(/Token name/i).fill("ci-runner");
    await page.getByRole("button", { name: /^Create$/ }).click();

    // Secret shown exactly once.
    await expect(page.getByText(/COPY IT NOW/)).toBeVisible();
    await expect(page.getByText(SECRET)).toBeVisible();

    // The new token is listed; revoke it.
    await page.getByRole("button", { name: /^Revoke$/ }).click();
    await expect(page.getByText(/^REVOKED$/)).toBeVisible();
  });
});
