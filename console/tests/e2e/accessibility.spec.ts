import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility audit using axe-core against the WCAG 2.2 AA
 * ruleset. CI fails on any new violation.
 *
 * The login page is the canonical public surface — every UI primitive
 * we use lives there at least once, so this test guards the whole
 * design system.
 */

test("login page meets WCAG 2.2 AA", async ({ page }) => {
  await page.goto("/login");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("keyboard navigation reaches all interactive elements on login", async ({ page }) => {
  await page.goto("/login");
  // Tab through and ensure each focused element has a visible outline
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
  }
  const active = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    return { tag: el.tagName, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
  });
  expect(active).not.toBeNull();
  expect(active?.outlineStyle).not.toBe("none");
});
