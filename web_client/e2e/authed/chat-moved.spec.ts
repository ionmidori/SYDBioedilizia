import type { Route } from '@playwright/test';
import { test, expect, userChatRoute } from './fixtures/authed-test';
import { SEEDED_MESSAGES, USER_CHAT_ID } from './fixtures/constants';
import { seedSession } from './fixtures/emulator';
import { UI_MESSAGE_STREAM_HEADERS, uiMessageStream } from './fixtures/ui-message-stream';

/**
 * Phase 139: a tab still on a chat that is no longer the user's — merged into
 * their chat from another device or tab — gets a 409 CHAT_MERGED from
 * /chat/stream. The page asks GET /api/me/chat again, opens the chat it gives
 * and sends the same message there, once, with no error on screen.
 *
 * Real: Firebase Auth + Firestore emulators and rules, the whole client flow
 * (useChatSession, useChatMoveRecovery). Faked, like every backend call in this
 * suite: /api/chat (409 for the old chat, a reply for the new one) and GET
 * /api/me/chat (the old chat, then the chat it was merged into).
 */

const QUESTION = 'Quanto costa rifare il bagno?';
const REPLY = 'Per un bagno da 6 metri quadri il budget indicativo è 12.000 euro.';

interface ChatCall {
  sessionId: string;
  text: string;
}

function chatCall(route: Route): ChatCall {
  const body = route.request().postDataJSON() as {
    sessionId: string;
    messages: { role: string; parts?: { type: string; text?: string }[] }[];
  };
  const last = body.messages.filter((m) => m.role === 'user').at(-1);
  return { sessionId: body.sessionId, text: last?.parts?.find((p) => p.type === 'text')?.text ?? '' };
}

test('a message refused for a merged chat goes again, once, in the user’s chat', async ({ page, uid }) => {
  // The chat the old one was merged into: it has the old chat's history.
  const mergedInto = `e2e-merged-into-${Date.now()}`;
  await seedSession(mergedInto, uid, SEEDED_MESSAGES.map((m) => ({ ...m, id: `m_${USER_CHAT_ID}_${m.id}` })));

  let userChat = USER_CHAT_ID;
  await page.route('**/api/py/me/chat', userChatRoute(() => userChat));

  const chats: ChatCall[] = [];
  await page.route('**/api/chat', async (route) => {
    const call = chatCall(route);
    chats.push(call);
    if (call.sessionId !== mergedInto) {
      // Merged meanwhile (another device): the backend answers from now on with the new chat.
      userChat = mergedInto;
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error_code: 'CHAT_MERGED',
          message: 'Questa conversazione è stata unita alla tua chat. Ricarica la pagina per continuare.',
        }),
      });
    }
    return route.fulfill({ status: 200, headers: UI_MESSAGE_STREAM_HEADERS, body: uiMessageStream({ text: REPLY }) });
  });

  await page.goto('/', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Apri chat' }).click();
  await expect(page.getByTestId('chat-messages')).toContainText(SEEDED_MESSAGES[0].content);

  await page.getByLabel('Messaggio chat').fill(QUESTION);
  await page.getByRole('button', { name: 'Invia messaggio' }).click();

  await expect(page.getByTestId('chat-message').last()).toContainText(REPLY, { timeout: 30_000 });
  expect(chats).toEqual([
    { sessionId: USER_CHAT_ID, text: QUESTION },
    { sessionId: mergedInto, text: QUESTION },
  ]);
  await expect(page.getByTestId('chat-message').filter({ hasText: QUESTION })).toHaveCount(1);
  // The history of the chat it was merged into, and no error on screen.
  await expect(page.getByTestId('chat-messages')).toContainText(SEEDED_MESSAGES[0].content);
  await expect(page.getByRole('button', { name: 'Chiudi errore' })).toHaveCount(0);
});
