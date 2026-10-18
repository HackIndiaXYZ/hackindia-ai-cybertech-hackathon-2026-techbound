import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signup, uniqueEmail } from './fixtures.js';

/**
 * Automated WCAG 2.1 AA gate (GAP-AND-PLAN 4D, closes P1-3's machine-checkable
 * half). axe-core is run against the real rendered app, and the assertion is the
 * strict one the plan demands: ZERO serious or critical violations. Minor/moderate
 * findings are reported but do not fail — they are triaged in
 * docs/ACCESSIBILITY-AUDIT.md. WebGL routes (avatar/pipeline/standalone) are
 * excluded here because headless GPU variance makes them flaky; they are covered
 * by the manual keyboard/contrast walk in the audit doc instead.
 */

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  // On failure, surface the offending selectors + contrast so CI logs and the
  // audit doc point straight at what to fix, not just a count.
  const detail = blocking.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({ target: n.target, message: n.failureSummary })),
  }));
  expect(
    detail,
    `axe found serious/critical violations on ${label}`,
  ).toEqual([]);
}

test.describe('axe-core WCAG 2.1 AA', () => {
  test('public screens', async ({ page }) => {
    for (const route of ['/', '/login', '/signup', '/how-it-works', '/accessibility']) {
      await page.goto(route);
      await scan(page, route);
    }
  });

  test('authenticated screens', async ({ page }) => {
    await signup(page, uniqueEmail('a11y'));
    for (const route of ['/app/dashboard', '/app/settings', '/app/translator', '/app/voice', '/call/new']) {
      await page.goto(route);
      await scan(page, route);
    }
  });
});
