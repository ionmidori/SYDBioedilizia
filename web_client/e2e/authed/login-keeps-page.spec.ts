import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, blockUnstubbedBackend } from './fixtures/authed-test';
import { AUTH_EMULATOR_URL, EMULATOR_PROJECT_ID, TEST_USER } from './fixtures/constants';
import { seedSession, setSessionOwner, type SeedMessage } from './fixtures/emulator';
import { caller, openLoginDialog } from './fixtures/guest';
import { chatStreamHandler } from './fixtures/ui-message-stream';

/**
 * Phase 139 PR-0b: after a login the user is on the page the login started
 * from, with the chat open as it was (the bug, on a phone: Google by redirect
 * came back with the chat closed; a magic link always went to the home page).
 * Both logins leave the page, so they start from /faq, not the home page.
 *
 * Real: Firebase Auth emulator (its Google sign-in page, the redirect round
 * trip, email links), Firestore emulator + rules, the whole client flow.
 * Faked, like every backend call in this suite: /api/chat (it saves the turn
 * to Firestore, as the backend does), the project list and the guest claim.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1';
const TICKET = 'e2e-login-keeps-page-ticket-0123456789abcd';

const GUEST_MESSAGES: readonly SeedMessage[] = [
  { id: 'guest-1', role: 'user', content: 'Vorrei rifare la cucina', ts: '2026-10-29T10:00:00Z' },
  { id: 'guest-2', role: 'assistant', content: 'Certo: quanti metri quadri misura la cucina?', ts: '2026-10-29T10:00:05Z' },
];

/** As a guest on /faq: opens the chat and writes, which signs in anonymously. Returns the chat id. */
async function guestChatsOnFaq(page: Page): Promise<string> {
  await page.route('**/api/chat', async (route) => {
    const { sessionId } = route.request().postDataJSON() as { sessionId: string };
    await seedSession(sessionId, caller(route).uid ?? '', GUEST_MESSAGES);
    await chatStreamHandler(GUEST_MESSAGES[1].content)(route);
  });
  await page.goto('/faq', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Apri chat' }).click();
  const input = page.getByLabel('Messaggio chat');
  await input.fill(GUEST_MESSAGES[0].content);
  // On a phone Firebase Auth is ready only once its iframe answers (up to 15 s
  // when Google's iframe script is slow) and the chat ignores a send until
  // then, keeping the text: tap again while it is still there, as a user would.
  await expect(async () => {
    if (await input.inputValue()) await page.getByRole('button', { name: 'Invia messaggio' }).click();
    await expect(page.getByTestId('chat-message').last()).toContainText(GUEST_MESSAGES[1].content, { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  const sessionId = await page.evaluate(() => localStorage.getItem('chatSessionId'));
  expect(sessionId).toBeTruthy();
  return sessionId!;
}

/** The chat is open by itself (nobody clicks "Apri chat") and shows the guest's conversation. */
async function expectChatOpenWithGuestConversation(page: Page) {
  await expect(page.getByTestId('chat-window')).toBeVisible({ timeout: 30_000 });
  for (const message of GUEST_MESSAGES) {
    await expect(page.getByTestId('chat-messages')).toContainText(message.content, { timeout: 30_000 });
  }
}

test.describe('Google by redirect, on a phone', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('comes back to the same page with the chat open', async ({ page }) => {
    const guestSessionId = await guestChatsOnFaq(page);
    // A new account: the guest is linked (same uid) and its chats are listed.
    const listedBy: (string | undefined)[] = [];
    await page.route('**/api/py/projects', (route) => {
      listedBy.push(caller(route).provider);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { session_id: guestSessionId, title: 'Cucina', status: 'draft', updated_at: '2026-10-29T10:00:05Z' },
        ]),
      });
    });

    const dialog = await openLoginDialog(page);
    await dialog.getByRole('button', { name: 'Continua con Google' }).click();

    // The emulator's Google sign-in page: the tab really left the site.
    await expect(
      page,
      'no redirect: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN of the build must be this host ' +
        '(build:e2e, playwright.emulator.config.ts and e2e-smoke.yml must agree)',
    ).toHaveURL((url) => url.href.startsWith(`${AUTH_EMULATOR_URL}/emulator/auth/handler`), { timeout: 15_000 });
    await page.locator('#add-account-button').click();
    await page.locator('#autogen-button').click();
    await page.locator('#sign-in').click();

    await page.waitForURL((url) => url.pathname === '/faq', { timeout: 30_000 });
    // Linked on the way back: the chats are listed by the Google account.
    await expect.poll(() => listedBy.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(new Set(listedBy)).toEqual(new Set(['google.com']));
    await expectChatOpenWithGuestConversation(page);
  });
});

test('a magic link, opened in another tab, comes back to the same page with the chat open', async ({
  page,
  context,
  uid,
}) => {
  const guestSessionId = await guestChatsOnFaq(page);
  await blockUnstubbedBackend(context); // the new tab has no page guard of its own
  await fakeGuestClaim(context, uid, guestSessionId);

  const dialog = await openLoginDialog(page);
  await dialog.getByRole('button', { name: 'Magic Link' }).click();
  await page.locator('#magic-email').fill(TEST_USER.email);
  await page.getByRole('button', { name: /Invia Link Magico/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('emailForSignIn'))).toBe(TEST_USER.email);

  // The email: what the user taps is the continue URL with the code (the
  // emulator does not send mail, it lists the links).
  const link = await signInLinkFor(TEST_USER.email);
  expect(new URL(link).pathname).toBe('/auth/verify');
  expect(new URL(link).searchParams.get('next')).toBe('/faq');
  expect(new URL(link).searchParams.get('chat')).toBe('open');

  const tab = await context.newPage();
  await tab.goto(link, { waitUntil: 'load' });
  await expect(tab.getByText('Accesso effettuato!')).toBeVisible({ timeout: 30_000 });
  await tab.waitForURL((url) => url.pathname === '/faq', { timeout: 30_000 });
  await expectChatOpenWithGuestConversation(tab);
});

/** What the backend does on a claim: the guest's chat now belongs to the account. */
async function fakeGuestClaim(context: BrowserContext, uid: string, guestSessionId: string) {
  await context.route('**/api/py/guest-claim/ticket', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ticket: TICKET, expires_at: new Date(Date.now() + 900_000).toISOString() }),
    }),
  );
  await context.route('**/api/py/guest-claim', async (route) => {
    const { ticket } = route.request().postDataJSON() as { ticket: string };
    if (caller(route).uid !== uid || ticket !== TICKET) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error_code":"GUEST_CLAIM_DENIED"}' });
    }
    await setSessionOwner(guestSessionId, uid);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session_ids: [guestSessionId], open_session_id: guestSessionId }),
    });
  });
}

/** The sign-in link the emulator "sent" to `email`, as the app's continue URL. */
async function signInLinkFor(email: string): Promise<string> {
  const res = await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/oobCodes`);
  const { oobCodes } = (await res.json()) as {
    oobCodes: { email: string; requestType: string; oobCode: string; oobLink: string }[];
  };
  const code = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').pop();
  expect(code).toBeTruthy();
  const emulatorLink = new URL(code!.oobLink);
  const link = new URL(emulatorLink.searchParams.get('continueUrl')!);
  link.searchParams.set('mode', 'signIn');
  link.searchParams.set('oobCode', code!.oobCode);
  link.searchParams.set('apiKey', emulatorLink.searchParams.get('apiKey')!);
  return link.toString();
}
