import { test, expect } from './fixtures/authed-test';
import { SEEDED_MESSAGES } from './fixtures/constants';
import { chatStreamHandler } from './fixtures/ui-message-stream';

/**
 * Authenticated chat, covering the SDK <-> Firestore reconciliation that
 * produced #125/#127/#128.
 *
 * Runs on `/` rather than `/dashboard/[id]`: for a signed-in, non-anonymous
 * user with no active project, useChatSession derives `global-<uid>` — the
 * session seeded by auth.setup.ts, and the one firestore.rules permits reading
 * without a parent project. A project route would additionally require stubbing
 * the project fetch for no extra coverage.
 */
test.describe('authenticated chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Apri chat' }).click();
    await expect(page.getByTestId('chat-window')).toBeVisible();
  });

  test('loads the seeded history from the Firestore emulator', async ({ page }) => {
    for (const message of SEEDED_MESSAGES) {
      await expect(page.getByTestId('chat-messages')).toContainText(message.content);
    }
  });

  test('sends a message and renders the streamed reply', async ({ page }) => {
    const reply = 'Per un bagno da 6 metri quadri il budget indicativo è 12.000 euro.';
    await page.route('**/api/chat', chatStreamHandler(reply));

    const response = page.waitForResponse(
      (r) => r.url().includes('/api/chat') && r.status() === 200,
    );

    await page.getByLabel('Messaggio chat').fill('Quanto costa?');
    await page.getByRole('button', { name: 'Invia messaggio' }).click();
    await response;

    await expect(
      page.getByTestId('chat-message').filter({ hasText: 'Quanto costa?' }),
    ).toBeVisible();

    const last = page.getByTestId('chat-message').last();
    await expect(last).toContainText(reply);
    await expect(last).toHaveAttribute('data-message-role', 'assistant');
  });

  test('history survives a full page reload', async ({ page }) => {
    // The single most valuable assertion in the suite: it exercises
    // useChatSync/planHistorySync reconciling the SDK state against the
    // Firestore snapshot after a cold start.
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: 'Apri chat' }).click();

    await expect(page.getByTestId('chat-window')).toBeVisible();
    for (const message of SEEDED_MESSAGES) {
      await expect(page.getByTestId('chat-messages')).toContainText(message.content);
    }
  });

  test('keeps the user message id stable across a reload', async ({ page }) => {
    // Unstable ids were the root of the duplicated/reordered bubbles in
    // #125/#127/#128: the id the SDK renders must be the id Firestore persists.
    const firstSeeded = page
      .locator('[data-testid="chat-message"][data-message-role="user"]')
      .first();
    await expect(firstSeeded).toBeVisible();
    const idBefore = await firstSeeded.getAttribute('data-message-id');
    expect(idBefore).toBeTruthy();

    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: 'Apri chat' }).click();

    const afterReload = page
      .locator('[data-testid="chat-message"][data-message-role="user"]')
      .first();
    await expect(afterReload).toBeVisible();
    await expect(afterReload).toHaveAttribute('data-message-id', idBefore!);
  });

  test('reports a rejected backend turn to the user', async ({ page }) => {
    // /api/chat 401s when the Authorization header is missing or stale; the
    // user must see it rather than a silently dead input.
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required' }),
      }),
    );

    await page.getByLabel('Messaggio chat').fill('ciao');
    await page.getByRole('button', { name: 'Invia messaggio' }).click();

    await expect(page.getByTestId('chat-window')).toContainText(/sessione scaduta|errore/i);
  });
});
