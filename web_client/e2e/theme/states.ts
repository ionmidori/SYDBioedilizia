import { expect, type Locator, type Page } from '@playwright/test';
import { CHAT_EVENTS } from '../../lib/chat-events';
import { settle } from './settle';

/**
 * Transient UI that a screenshot at rest never shows (overlays, dialogs,
 * menus): each state opens itself and says which pages it belongs to.
 */
export interface ThemeState {
  id: string;
  appliesTo: (template: string, auth: 'user' | 'admin' | undefined) => boolean;
  /** Return false when the state does not exist at this viewport (e.g. a mobile-only menu). */
  open: (page: Page) => Promise<boolean>;
}

/** Motion (JS) animations ignore `animations: 'disabled'`: wait until the element stops moving. */
async function waitUntilStill(locator: Locator) {
  await expect(locator).toBeVisible();
  let previous = '';
  await expect
    .poll(async () => {
      const box = JSON.stringify(await locator.boundingBox());
      const still = box === previous;
      previous = box;
      return still;
    }, { intervals: [150] })
    .toBe(true);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1280;
const onHome = (template: string) => template === '/';

export const STATES: ThemeState[] = [
  {
    id: 'cookie-banner',
    appliesTo: onHome,
    open: async (page) => {
      await page.context().clearCookies({ name: 'syd_cookie_consent' });
      await page.reload({ waitUntil: 'load' });
      await settle(page);
      await waitUntilStill(page.getByRole('button', { name: 'Accetta Tutti' }));
      return true;
    },
  },
  {
    id: 'cookie-settings',
    appliesTo: onHome,
    open: async (page) => {
      await page.context().clearCookies({ name: 'syd_cookie_consent' });
      await page.reload({ waitUntil: 'load' });
      await settle(page);
      await page.getByRole('button', { name: 'Personalizza' }).click();
      await waitUntilStill(page.getByRole('button', { name: 'Chiudi le impostazioni' }));
      return true;
    },
  },
  {
    id: 'auth-dialog',
    appliesTo: onHome,
    open: async (page) => {
      if (isMobile(page)) return false; // the desktop sign-in button is `hidden xl:flex`
      await page.getByRole('button', { name: 'Accedi' }).first().click();
      await waitUntilStill(page.getByRole('dialog'));
      return true;
    },
  },
  {
    id: 'mobile-menu',
    appliesTo: onHome,
    open: async (page) => {
      if (!isMobile(page)) return false;
      await page.getByRole('button', { name: 'Menu' }).click();
      await waitUntilStill(page.getByRole('dialog'));
      await settle(page); // the welcome badge may still be typing under the menu
      return true;
    },
  },
  {
    id: 'chat-open',
    appliesTo: onHome,
    open: async (page) => {
      await page.evaluate((name) => window.dispatchEvent(new Event(name)), CHAT_EVENTS.open);
      await waitUntilStill(page.getByTestId('chat-window').first());
      return true;
    },
  },
];
