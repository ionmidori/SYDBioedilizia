import { checkCases, runThemeCheck } from '../theme/checks';
import { consentCookie, authedPages } from '../theme/pages';
import { jsonRoute, test } from './fixtures/authed-test';

/**
 * Theme harness, signed-in pages (dashboard, admin), against the emulators.
 * The backend is not faked beyond the admin identity: unstubbed calls answer
 * 599 (fixture guard rail), so pages render their error/empty states, which are
 * deterministic and themed like everything else.
 */

// Full-page screenshots of long pages take longer than a smoke check.
// Retries absorb rare timing noise (motion, timers); a real visual change fails every attempt.
test.describe.configure({ timeout: 60_000, retries: 2 });

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([consentCookie(baseURL!)]);
  await page.route('**/api/py/admin/me', jsonRoute({ uid: 'admin-uid', email: 'e2e@syd.test', role: 'admin', mfa: false }));
});

for (const c of checkCases(authedPages())) {
  test(`@visual ${c.name}`, async ({ page }, testInfo) => {
    await runThemeCheck(page, c, 'visual', testInfo);
  });

  test(`a11y ${c.name}`, async ({ page }, testInfo) => {
    await runThemeCheck(page, c, 'a11y', testInfo);
  });
}
