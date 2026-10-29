import type { Page, Route } from '@playwright/test';
import { expect } from './authed-test';

/** Sign-in provider and uid of the Firebase ID token a request carries. */
export function caller(route: Route): { provider?: string; uid?: string } {
  const token = route.request().headers()['authorization']?.replace(/^Bearer /, '') ?? '';
  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}');
  return { provider: payload.firebase?.sign_in_provider, uid: payload.user_id };
}

/** Opens the login dialog the way the navbar does. */
export async function openLoginDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  // Retried: an event fired before GlobalAuthListener hydrates is lost (see auth.setup.ts).
  await expect(async () => {
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL')),
    );
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return dialog;
}
