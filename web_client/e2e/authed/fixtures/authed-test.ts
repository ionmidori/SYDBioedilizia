import { test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { UID_FILE, USER_CHAT_ID } from './constants';

/**
 * Shared fixture for the authenticated specs.
 *
 * Three jobs:
 *  1. expose the seeded `uid` (specs need it to build `/quote/user/{uid}` routes)
 *  2. install guard-rail routes so a forgotten stub fails loudly instead of
 *     silently reaching the real Cloud Run backend;
 *  3. answer GET /api/me/chat with the seeded user's chat: every page asks for
 *     it once the user is signed in (Phase 139). A spec overrides it with its
 *     own route (the last one registered wins).
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
    await blockUnstubbedBackend(page);
    await page.route('**/api/py/me/chat', userChatRoute(() => USER_CHAT_ID));
    await use(page);
  },
});

export { expect };

/**
 * The guard rail of every page: register it first, so specs' more specific
 * routes win (Playwright matches handlers in reverse registration order). A
 * spec that opens another tab registers it on the context (page routes still
 * come first).
 */
export async function blockUnstubbedBackend(target: Page | BrowserContext) {
  await target.route('**/api/py/**', (route: Route) =>
    route.fulfill({
      status: 599,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unstubbed backend call: ${route.request().url()}` }),
    }),
  );
  // Belt and braces: never let anything reach the real backend host.
  await target.route('**/syd-brain-*.run.app/**', (route: Route) => route.abort('blockedbyclient'));
}

/** GET /api/me/chat answering `chatId()`, read at call time (a spec's account chat may change). */
export function userChatRoute(chatId: () => string) {
  return (route: Route) => jsonRoute({ chat_id: chatId(), created: false })(route);
}

/** Convenience: fulfil a route with a JSON body. */
export function jsonRoute(body: unknown) {
  return (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
}
