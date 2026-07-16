import { test, expect } from '@playwright/test';

/**
 * Smoke suite: verifies the production build actually serves its critical
 * public routes without a server error or a client crash. Intentionally
 * assertion-light (status + title + no error overlay) so it does not break on
 * routine content/design changes.
 */

// Public, statically-prerendered routes that must always render.
const PUBLIC_ROUTES = ['/', '/faq', '/privacy'];

for (const route of PUBLIC_ROUTES) {
  test(`renders ${route} without error`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

    // Server must not 5xx/4xx the route.
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(response!.status(), `bad status for ${route}`).toBeLessThan(400);

    // Document rendered.
    await expect(page.locator('body')).toBeVisible();

    // No Next.js runtime error boundary.
    await expect(page.locator('body')).not.toContainText('Application error');
  });
}

test('homepage has the SYD title and a main landmark', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/SYD/i);
  await expect(page.locator('main').first()).toBeVisible();
});
