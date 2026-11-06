import { test, expect } from '@playwright/test';
import { checkCases, runThemeCheck } from './checks';
import { consentCookie, TEMPLATES, UNRESOLVED_TEMPLATES, publicPages } from './pages';

/**
 * Theme harness, public pages. `@visual` screenshots compare against local
 * baselines (e2e/.visual-baseline, not committed: font rendering differs between
 * OSes) and are skipped in CI; the axe audit runs everywhere.
 */

// Full-page screenshots of long pages take longer than a smoke check.
// Retries absorb rare timing noise (motion, timers); a real visual change fails every attempt.
test.describe.configure({ timeout: 60_000, retries: 2 });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([consentCookie(baseURL!)]);
});

test('every route template resolves to a URL to check', () => {
  expect(TEMPLATES.length).toBeGreaterThan(0);
  expect(UNRESOLVED_TEMPLATES).toEqual([]);
});

for (const c of checkCases(publicPages())) {
  test(`@visual ${c.name}`, async ({ page }, testInfo) => {
    await runThemeCheck(page, c, 'visual', testInfo);
  });

  test(`a11y ${c.name}`, async ({ page }, testInfo) => {
    await runThemeCheck(page, c, 'a11y', testInfo);
  });
}
