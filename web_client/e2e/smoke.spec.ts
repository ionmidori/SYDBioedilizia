import { test, expect } from '@playwright/test';

/**
 * Smoke suite: verifies the production build actually serves its critical
 * public routes without a server error or a client crash. Intentionally
 * assertion-light (status + title + no uncaught client error) so it does not
 * break on routine content/design changes.
 *
 * We wait for `load` (not just `domcontentloaded`) and listen for `pageerror`
 * so that exceptions thrown during client bundle execution / hydration — which
 * fire asynchronously, after the HTML is parsed — are actually caught.
 */

// Public, statically-prerendered routes that must always render.
const PUBLIC_ROUTES = ['/', '/faq', '/privacy'];

for (const route of PUBLIC_ROUTES) {
  test(`renders ${route} without error`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    const response = await page.goto(route, { waitUntil: 'load' });

    // Server must not 5xx/4xx the route.
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status(), `bad status for ${route}`).toBeLessThan(400);

    // Document rendered.
    await expect(page.locator('body')).toBeVisible();

    // No Next.js runtime error boundary.
    await expect(page.locator('body')).not.toContainText('Application error');

    // No uncaught client-side exception during load/hydration.
    expect(
      pageErrors,
      `client-side errors on ${route}: ${pageErrors.map((e) => e.message).join(', ')}`,
    ).toHaveLength(0);
  });
}

test('homepage has the SYD title and a main landmark', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page).toHaveTitle(/SYD/i);
  await expect(page.locator('main').first()).toBeVisible();
});
