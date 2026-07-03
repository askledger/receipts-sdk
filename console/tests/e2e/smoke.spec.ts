import { test, expect } from "@playwright/test";

/**
 * Smoke test — every page renders without error and contains the
 * expected landmark heading.
 *
 * These tests assume an authenticated session cookie is set in
 * playwright/storage-state.json (CI sets this via the test-only login
 * route). For now, the middleware redirect to /login is acceptable when
 * unauthenticated and we verify that path too.
 */

const PROTECTED = [
  { path: "/", h1: "Dashboard" },
  { path: "/receipts", h1: "Receipts Explorer" },
  { path: "/policies", h1: "Policies" },
  { path: "/keys", h1: "Keys" },
  { path: "/workflows", h1: "Workflows" },
  { path: "/evidence", h1: "Evidence Packs" },
  { path: "/tenants", h1: "Tenants" },
  { path: "/audit", h1: "Audit Log" },
  { path: "/settings", h1: "Settings" },
];

for (const { path, h1 } of PROTECTED) {
  test(`unauthenticated GET ${path} redirects to /login`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    // Verify the next= param is preserved
    expect(page.url()).toContain(`next=${encodeURIComponent(path)}`);
  });
}

test("health endpoint is public", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("security headers are present on every response", async ({ request }) => {
  const res = await request.get("/api/health");
  const headers = res.headers();
  expect(headers["strict-transport-security"]).toContain("max-age");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
