import type { Route } from '@playwright/test';
import { test, expect } from './fixtures/authed-test';
import { TEST_USER } from './fixtures/constants';
import { seedMessages, seedSession, setSessionOwner, type SeedMessage } from './fixtures/emulator';
import { caller } from './fixtures/guest';
import { UI_MESSAGE_STREAM_HEADERS, uiMessageStream } from './fixtures/ui-message-stream';

/**
 * Phase 138 PR-6: a guest confirms a quote, sees ONE login card (in
 * production, 28 Oct, the agents asked three times in one turn: three cards),
 * signs in to an existing account, and the confirmed request starts again in
 * the guest's conversation, without the user typing it again — only once the
 * guest's chats have moved to the account (the bug: the message left 1.5 s
 * after the login, for `global-<uid>`, while the claim was still running).
 *
 * Real: Firebase Auth + Firestore emulators and rules, the whole client flow.
 * Faked, like every backend call in this suite: /api/chat (it writes the
 * reply to Firestore as the backend does, with its tool calls) and the two
 * guest-claim endpoints — the claim slower than the old 1.5 s timer.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const TICKET = 'e2e-guest-login-resume-ticket-0123456789ab';
const ASK = 'Vorrei un preventivo per il bagno: 2 x 2,5 m, doccia walk-in e sanitari sospesi.';
const CONFIRM = 'Sì, prepara pure la richiesta di preventivo.';
const LOGIN_REPLY = 'Per registrare la richiesta serve un account gratuito.';
const DONE_REPLY = 'Ho registrato la tua richiesta di preventivo.';
const CLAIM_DELAY_MS = 4_000;

interface ChatCall {
  provider?: string;
  sessionId: string;
  text: string;
}

function chatCall(route: Route): ChatCall {
  const body = route.request().postDataJSON() as {
    sessionId: string;
    messages: { role: string; parts?: { type: string; text?: string }[] }[];
  };
  const last = body.messages.filter((m) => m.role === 'user').at(-1);
  return {
    provider: caller(route).provider,
    sessionId: body.sessionId,
    text: last?.parts?.find((p) => p.type === 'text')?.text ?? '',
  };
}

test('a guest confirms, sees one login card, and the quote starts again in its chat after the login', async ({
  page,
  uid,
}) => {
  const calls: string[] = [];
  const chats: ChatCall[] = [];

  await page.route('**/api/chat', async (route) => {
    const call = chatCall(route);
    chats.push(call);
    calls.push(`chat:${call.provider}`);
    const turn = chats.length;
    const reply = turn === 1 ? 'Ho tutto quello che mi serve. Preparo la richiesta di preventivo?'
      : turn === 2 ? LOGIN_REPLY : DONE_REPLY;
    const ts = (s: number) => new Date(Date.UTC(2026, 9, 29, 10, 0, s)).toISOString();
    if (turn === 2) {
      // What the backend saved for the confirmation turn in production: the
      // router asked for the login twice, then the quote agent once more.
      const history: SeedMessage[] = [
        { id: 'm1', role: 'user', content: ASK, ts: ts(0) },
        { id: 'm2', role: 'assistant', content: 'Ho tutto quello che mi serve. Preparo la richiesta di preventivo?', ts: ts(5) },
        { id: 'm3', role: 'user', content: CONFIRM, ts: ts(10) },
        {
          id: 'm4', role: 'assistant', content: LOGIN_REPLY, ts: ts(15),
          toolCalls: ['request_login', 'request_login', 'request_login'],
        },
      ];
      await seedSession(call.sessionId, caller(route).uid ?? '', history);
    }
    if (turn === 3) {
      await seedMessages(call.sessionId, [
        { id: 'm5', role: 'user', content: CONFIRM, ts: ts(40) },
        { id: 'm6', role: 'assistant', content: DONE_REPLY, ts: ts(45) },
      ]);
    }
    await route.fulfill({ status: 200, headers: UI_MESSAGE_STREAM_HEADERS, body: uiMessageStream({ text: reply }) });
  });
  await page.route('**/api/py/guest-claim/ticket', (route) => {
    calls.push(`ticket:${caller(route).provider}`);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ticket: TICKET, expires_at: new Date(Date.now() + 900_000).toISOString() }),
    });
  });
  await page.route('**/api/py/guest-claim', async (route) => {
    const who = caller(route);
    const guestSessionId = chats[0]?.sessionId;
    if (who.uid !== uid || !guestSessionId) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error_code":"GUEST_CLAIM_DENIED"}' });
    }
    // A cold start: longer than the 1.5 s the pending message used to wait.
    await new Promise((resolve) => setTimeout(resolve, CLAIM_DELAY_MS));
    await setSessionOwner(guestSessionId, uid);
    calls.push('claim:done');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session_ids: [guestSessionId], open_session_id: guestSessionId }),
    });
  });

  // 1. As a guest: the request, then the confirmation.
  await page.goto('/', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Apri chat' }).click();
  for (const text of [ASK, CONFIRM]) {
    await page.getByLabel('Messaggio chat').fill(text);
    await page.getByRole('button', { name: 'Invia messaggio' }).click();
    await expect(page.getByLabel('Messaggio chat')).toHaveValue('');
  }

  // 2. Three login requests in the reply, one card.
  const cardButton = page.getByRole('button', { name: 'Accedi o Registrati' });
  await expect(cardButton).toHaveCount(1, { timeout: 30_000 });

  // 3. Sign in from the card to the existing account.
  await cardButton.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Usa Email e Password' }).click();
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // 4. The confirmation is sent again, by the account, in the guest's chat, after the claim.
  await expect.poll(() => chats.length, { timeout: 30_000 }).toBe(3);
  expect(chats[2]).toEqual({ provider: 'password', sessionId: chats[0].sessionId, text: CONFIRM });
  expect(calls).toEqual(['chat:anonymous', 'chat:anonymous', 'ticket:anonymous', 'claim:done', 'chat:password']);
  expect(chats.some((c) => c.sessionId.startsWith('global-'))).toBe(false);

  // 5. Signed in, the chat still open: no login card left in the old messages.
  await expect(page.getByTestId('chat-window')).toBeVisible();
  await expect(page.getByTestId('chat-messages')).toContainText(DONE_REPLY);
  await expect(cardButton).toHaveCount(0);
});
