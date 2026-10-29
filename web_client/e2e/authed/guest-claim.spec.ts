import { test, expect } from './fixtures/authed-test';
import { TEST_USER } from './fixtures/constants';
import { seedSession } from './fixtures/emulator';
import { caller, openLoginDialog } from './fixtures/guest';
import { chatStreamHandler } from './fixtures/ui-message-stream';

/**
 * Phase 138 PR-6: a guest who signs in to an EXISTING account finds the chat
 * it wrote as a guest (the bug: the chat opened the account's last project
 * and the guest's messages were gone).
 *
 * Real: Firebase Auth emulator (anonymous guest, then email login), Firestore
 * emulator + production rules (the account reads the chat only once it owns
 * it), the whole client flow (lib/auth/guest-claim.ts). Faked, like every
 * backend call in this suite: the two guest-claim endpoints. The fake checks
 * WHO calls (ticket: the anonymous guest; claim: the account, with that
 * ticket) and does what the backend does — the chat changes owner. The
 * transfer itself is covered by pytest (tests/unit/test_guest_claim.py).
 */

// Start signed out: this spec is about the guest, not the seeded session.
test.use({ storageState: { cookies: [], origins: [] } });

const TICKET = 'e2e-guest-claim-ticket-0123456789abcdefghij';

const GUEST_MESSAGES = [
  { id: 'guest-1', role: 'user', content: 'Vorrei rifare il bagno di casa', ts: '2026-10-28T21:40:00Z' },
  { id: 'guest-2', role: 'assistant', content: 'Certo: quanti metri quadri misura il bagno?', ts: '2026-10-28T21:40:05Z' },
] as const;

test('a guest who signs in to an existing account finds its chat', async ({ page, uid }) => {
  const calls: string[] = [];
  let guestUid: string | undefined;
  let guestSessionId: string | null = null;

  await page.route('**/api/chat', chatStreamHandler(GUEST_MESSAGES[1].content));
  await page.route('**/api/py/guest-claim/ticket', (route) => {
    const who = caller(route);
    calls.push(`ticket:${who.provider}`);
    guestUid = who.uid;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ticket: TICKET, expires_at: new Date(Date.now() + 900_000).toISOString() }),
    });
  });
  await page.route('**/api/py/guest-claim', async (route) => {
    const who = caller(route);
    const { ticket } = route.request().postDataJSON() as { ticket: string };
    calls.push(`claim:${who.provider}`);
    if (who.uid !== uid || ticket !== TICKET || !guestSessionId) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error_code":"GUEST_CLAIM_DENIED"}' });
    }
    // What the backend does: the guest's chat (same id) now belongs to the account.
    await seedSession(guestSessionId, uid, GUEST_MESSAGES);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session_ids: [guestSessionId], open_session_id: guestSessionId }),
    });
  });

  // 1. As a guest: the first message signs in anonymously.
  await page.goto('/', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Apri chat' }).click();
  await page.getByLabel('Messaggio chat').fill(GUEST_MESSAGES[0].content);
  await page.getByRole('button', { name: 'Invia messaggio' }).click();
  await expect(page.getByTestId('chat-message').last()).toContainText(GUEST_MESSAGES[1].content);
  guestSessionId = await page.evaluate(() => localStorage.getItem('chatSessionId'));
  expect(guestSessionId).toBeTruthy();

  // 2. Sign in to the existing account with email and password.
  const dialog = await openLoginDialog(page);
  await dialog.getByRole('button', { name: 'Usa Email e Password' }).click();
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // The ticket came from the guest, the claim from the account.
  expect(calls).toEqual(['ticket:anonymous', 'claim:password']);
  expect(guestUid).toBeTruthy();
  expect(guestUid).not.toBe(uid);

  // 3. The chat, still open, shows the guest's conversation, read from Firestore as the account.
  await expect(page.getByTestId('chat-window')).toBeVisible();
  for (const message of GUEST_MESSAGES) {
    await expect(page.getByTestId('chat-messages')).toContainText(message.content);
  }
  await expect(page.getByRole('alert').filter({ hasText: 'non recuperate' })).toHaveCount(0);
});
