import { test, expect, userChatRoute } from './fixtures/authed-test';
import { TEST_USER } from './fixtures/constants';
import { seedMessages, seedSession } from './fixtures/emulator';
import { caller, openLoginDialog } from './fixtures/guest';
import { chatStreamHandler } from './fixtures/ui-message-stream';

/**
 * Phase 138 PR-6: a guest who signs in to an EXISTING account finds the chat
 * it wrote as a guest (the bug: the chat opened the account's last project
 * and the guest's messages were gone). Phase 139: the account already has its
 * one chat, and the guest's conversation is merged into it.
 *
 * Real: Firebase Auth emulator (anonymous guest, then email login), Firestore
 * emulator + production rules (the account reads only its own chat), the whole
 * client flow (lib/auth/guest-claim.ts, useChatSession). Faked, like every
 * backend call in this suite: the two guest-claim endpoints and GET
 * /api/me/chat. The fakes check WHO calls (ticket: the anonymous guest; claim
 * and chat: the account, the chat only after the claim) and do what the
 * backend does — the guest's messages are copied into the account's chat. The
 * merge itself is covered by pytest (tests/unit/test_chat_merge.py).
 */

// Start signed out: this spec is about the guest, not the seeded session.
test.use({ storageState: { cookies: [], origins: [] } });

const TICKET = 'e2e-guest-claim-ticket-0123456789abcdefghij';

const ACCOUNT_MESSAGES = [
  { id: 'account-1', role: 'user', content: 'Ho una cucina da rifare', ts: '2026-10-27T09:00:00Z' },
] as const;

const GUEST_MESSAGES = [
  { id: 'guest-1', role: 'user', content: 'Vorrei rifare il bagno di casa', ts: '2026-10-28T21:40:00Z' },
  { id: 'guest-2', role: 'assistant', content: 'Certo: quanti metri quadri misura il bagno?', ts: '2026-10-28T21:40:05Z' },
] as const;

test('a guest who signs in to an existing account finds its chat in the account’s chat', async ({ page, uid }) => {
  const calls: string[] = [];
  let guestUid: string | undefined;
  let guestSessionId: string | null = null;
  // The account's one chat, already there before the guest signs in.
  const accountChat = `e2e-account-chat-${Date.now()}`;
  await seedSession(accountChat, uid, ACCOUNT_MESSAGES);

  await page.route('**/api/py/me/chat', (route) => {
    calls.push(`chat:${caller(route).provider}`);
    return userChatRoute(() => accountChat)(route);
  });

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
    // What the backend does: the guest's messages are merged into the account's chat.
    await seedMessages(accountChat, GUEST_MESSAGES.map((m) => ({ ...m, id: `m_${guestSessionId}_${m.id}` })));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session_ids: [guestSessionId], open_session_id: accountChat }),
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

  // The ticket came from the guest, the claim from the account, then the chat:
  // not before the claim, or the backend would make an empty chat beside the guest's.
  await expect.poll(() => calls).toEqual(['ticket:anonymous', 'claim:password', 'chat:password']);
  expect(guestUid).toBeTruthy();
  expect(guestUid).not.toBe(uid);

  // 3. The chat, still open, is the account's, with the guest's conversation in
  // it, read from Firestore as the account.
  await expect(page.getByTestId('chat-window')).toBeVisible();
  for (const message of [...ACCOUNT_MESSAGES, ...GUEST_MESSAGES]) {
    await expect(page.getByTestId('chat-messages')).toContainText(message.content);
  }
  await expect(page.getByRole('alert').filter({ hasText: 'non recuperate' })).toHaveCount(0);
});
