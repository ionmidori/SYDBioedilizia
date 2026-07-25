import { test as base, expect, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { UID_FILE } from './constants';

/**
 * Shared fixture for the authenticated specs.
 *
 * Two jobs:
 *  1. expose the seeded `uid` (specs need it to build `/quote/user/{uid}` routes)
 *  2. install guard-rail routes so a forgotten stub fails loudly instead of
 *     silently reaching the real Cloud Run backend.
 *
 * The guard rail matters more than it looks: `next.config.ts` bakes the
 * `/api/py/*` -> Cloud Run rewrite into the production build, so an
 * unintercepted call in a production-built E2E run hits PRODUCTION.
 */

export const test = base.extend<{ uid: string }>({
  uid: async ({}, use) => {
    await use(readFileSync(UID_FILE, 'utf8').trim());
  },

  page: async ({ page }, use) => {
    // Registered first; specs register more specific routes afterwards and
    // Playwright matches handlers in reverse registration order (last wins).
    await page.route('**/api/py/**', (route: Route) =>
      route.fulfill({
        status: 599,
        contentType: 'application/json',
        body: JSON.stringify({ error: `unstubbed backend call: ${route.request().url()}` }),
      }),
    );
    // Belt and braces: never let anything reach the real backend host.
    await page.route('**/syd-brain-*.run.app/**', (route: Route) => route.abort('blockedbyclient'));

    await use(page);
  },
});

export { expect };

/** Convenience: fulfil a route with a JSON body. */
export function jsonRoute(body: unknown) {
  return (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
}
