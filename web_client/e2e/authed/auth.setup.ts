import { test as setup, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { AUTH_DIR, AUTH_STATE_FILE, TEST_USER, UID_FILE } from './fixtures/constants';
import { createTestUser, resetEmulators, seedChatHistory } from './fixtures/emulator';

/**
 * Signs in against the Auth emulator and captures the storage state reused by
 * every authenticated spec.
 *
 * Also resets and re-seeds the emulators, so a run always starts from a known
 * state regardless of what a previous run left behind.
 */
setup('authenticate against the Firebase Auth emulator', async ({ page, context, baseURL }) => {
  await resetEmulators();
  const { localId: uid } = await createTestUser(TEST_USER.email, TEST_USER.password);
  await seedChatHistory(uid);

  // AuthDialog's post-login hook may call projectsApi.claimProject(). In a
  // production build that rewrites to Cloud Run, so it must never leave the box.
  await page.route('**/api/py/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );

  await page.goto('/', { waitUntil: 'load' });

  // Open the dialog via the global event rather than the nav button: the
  // Navbar's SignInButton is `hidden xl:flex` and delegates to the singleton
  // AuthDialog mounted by GlobalAuthListener, so clicking it is both
  // viewport-dependent and indirect.
  //
  // The dispatch is retried because the listener is registered by a client
  // component: an event fired before hydration completes is simply lost, and
  // firing once made this step pass or fail depending on machine speed.
  const dialog = page.getByRole('dialog');
  await expect(async () => {
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('OPEN_LOGIN_MODAL', { detail: { redirectOnLogin: true } }),
      ),
    );
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  // The dialog opens on the social tab; switch to the popup-free email form.
  // (Guarded: if a future default lands directly on the email form, the button
  // is absent and the fill below still works.)
  const emailTabButton = dialog.getByRole('button', { name: 'Usa Email e Password' });
  if (await emailTabButton.isVisible().catch(() => false)) {
    await emailTabButton.click();
  }

  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();

  // handleLoginSuccess() redirects here once the (stubbed) claim settles.
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  // ── The `auth-token` cookie ────────────────────────────────────────────────
  // app/actions/auth-session.ts sets it with `secure: NODE_ENV === 'production'`,
  // and `next start` is always production — so over plain http on loopback the
  // browser drops it, and proxy.ts would bounce every /dashboard/* request.
  // Mint it ourselves with secure:false.
  //
  // This is sound, not a hack around a security control: proxy.ts::isTokenExpired
  // only base64-decodes the JWT payload and reads `exp` — it never verifies the
  // signature (verification is the Python backend's job). An emulator ID token is
  // structurally valid, so it satisfies the guard exactly like a real one.
  const idToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('firebase:authUser:'));
    if (!key) return null;
    return JSON.parse(localStorage.getItem(key)!).stsTokenManager?.accessToken ?? null;
  });
  expect(idToken, 'no Firebase ID token in localStorage after login').toBeTruthy();

  await context.addCookies([
    {
      name: 'auth-token',
      value: idToken as string,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await mkdir(AUTH_DIR, { recursive: true });
  await context.storageState({ path: AUTH_STATE_FILE });
  await writeFile(UID_FILE, uid, 'utf8');
});
