import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { test, expect, jsonRoute } from './fixtures/authed-test';
import { SEEDED_MESSAGES, UID_FILE, USER_CHAT_ID } from './fixtures/constants';
import { clearHouse, seedHouse, type SeedFile, type SeedRoom } from './fixtures/emulator';

/**
 * The dashboard is the house (Phase 139): the user's one chat beside its media
 * (by room, live from Firestore), its quote and its details.
 *
 * Rooms and files are seeded in the emulator (the rules let the owner read
 * them); the backend calls (the quote, the details, the quotes list) are
 * route-mocked.
 */

const ROOMS: readonly SeedRoom[] = [
  { id: 'bagno', label: 'Bagno', type: 'bagno' },
  { id: 'cucina', label: 'Cucina', type: 'cucina' },
];

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/demo/o';
const FILES: readonly SeedFile[] = [
  { id: 'file-bagno', name: 'bagno.png', type: 'image', url: `${STORAGE}/bagno.png?alt=media`, roomId: 'bagno' },
  { id: 'file-cucina', name: 'cucina.png', type: 'image', url: `${STORAGE}/cucina.png?alt=media`, roomId: 'cucina' },
  { id: 'file-pianta', name: 'pianta.pdf', type: 'document', url: `${STORAGE}/pianta.pdf?alt=media`, roomId: null },
];

/** Smallest valid PNG (1x1, transparent). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const item = (description: string, room_id: string) => ({
  sku: 'X', description, unit: 'mq', qty: 6, unit_price: 0, total: 0, room_id,
});

function draftQuote(uid: string, status = 'draft') {
  return {
    project_id: USER_CHAT_ID,
    user_id: uid,
    quote_number: 'PRV-2026-0007',
    status,
    items: [item('Rimozione piastrelle', 'bagno'), item('Tinteggiatura', 'cucina')],
    rooms: [
      { room_id: 'bagno', room_label: 'Bagno', room_type: 'bagno', room_subtotal: 0 },
      { room_id: 'cucina', room_label: 'Cucina', room_type: 'cucina', room_subtotal: 0 },
    ],
  };
}

/**
 * The backend of the house. The quote is a draft until "Invia al team"; then
 * the backend answers it is with the team, and so does the quote read again.
 */
async function stubHouseBackend(page: Page, uid: string) {
  let status = 'draft';
  const submits: string[] = [];
  await page.route('**/api/py/quote/user/**', jsonRoute([]));
  await page.route(`**/api/py/projects/${USER_CHAT_ID}`, jsonRoute({
    session_id: USER_CHAT_ID,
    title: 'Nuovo Progetto',
    user_id: uid,
    status: 'draft',
    message_count: SEEDED_MESSAGES.length,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:01:00Z',
    construction_details: null,
  }));
  await page.route(`**/api/py/quote/${USER_CHAT_ID}`, (route: Route) => jsonRoute(draftQuote(uid, status))(route));
  await page.route(`**/api/py/quote/${USER_CHAT_ID}/submit`, (route: Route) => {
    submits.push(route.request().headers()['idempotency-key'] ?? '');
    status = 'pending_review';
    return jsonRoute({ project_id: USER_CHAT_ID, status, quote_number: 'PRV-2026-0007', duplicate: false })(route);
  });
  await page.route(`${STORAGE}/**`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }));
  return { submits };
}

test.describe('the house', () => {
  // Seeded here, not in the setup: the other specs' chat has no rooms.
  test.beforeAll(async () => {
    await seedHouse(readFileSync(UID_FILE, 'utf8').trim(), ROOMS, FILES);
  });

  test.afterAll(async () => {
    await clearHouse(ROOMS, FILES);
  });

  test('on a desktop: the chat beside the media of the house, by room', async ({ page, uid }) => {
    await stubHouseBackend(page, uid);
    await page.goto('/dashboard', { waitUntil: 'load' });

    await expect(page.getByTestId('chat-window')).toHaveCount(1);
    await expect(page.getByTestId('chat-window')).toContainText(SEEDED_MESSAGES[1].content);
    await expect(page.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');

    const media = page.getByRole('tabpanel', { name: 'Media' });
    await expect(media.getByRole('button', { name: /^Apri / })).toHaveCount(3);

    await media.getByRole('button', { name: /^Bagno/ }).click();
    await expect(media.getByRole('button', { name: /^Apri / })).toHaveCount(1);
    await expect(media.getByRole('button', { name: 'Apri bagno.png' })).toBeVisible();

    await media.getByRole('button', { name: /^Senza stanza/ }).click();
    await expect(media.getByRole('button', { name: 'Apri pianta.pdf' })).toBeVisible();
  });

  test('on a desktop: the draft goes to the team from the quote tab', async ({ page, uid }) => {
    const { submits } = await stubHouseBackend(page, uid);
    await page.goto('/dashboard?view=quote', { waitUntil: 'load' });

    const quote = page.getByRole('tabpanel', { name: 'Preventivo' });
    await expect(quote.getByRole('region', { name: 'Bagno' })).toContainText('Rimozione piastrelle');
    await expect(quote.getByRole('region', { name: 'Cucina' })).toContainText('Tinteggiatura');
    await expect(quote).not.toContainText('€');

    await quote.getByTestId('submit-quote-button').click();
    const dialog = page.getByRole('dialog', { name: 'Invia al team' });
    await dialog.getByRole('button', { name: 'Invia al team' }).click();

    await expect(dialog.getByRole('status')).toContainText('Richiesta inviata');
    expect(submits).toHaveLength(1);
    expect(submits[0]).not.toBe('');
    await page.keyboard.press('Escape');
    await expect(quote.getByTestId('quote-with-team')).toHaveText('Inviato al team, in revisione');
    await expect(quote.getByTestId('submit-quote-button')).toHaveCount(0);
  });

  test('on a phone: the four tabs of the house, one at a time', async ({ page, uid }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The first visit on a phone shows the tour of the house: seen already.
    await page.addInitScript(() => localStorage.setItem('syd_house_tour_completed', 'true'));
    await stubHouseBackend(page, uid);
    await page.goto('/dashboard', { waitUntil: 'load' });

    const chat = page.getByTestId('chat-window');
    await expect(chat).toBeVisible();

    await page.getByRole('button', { name: 'Vai a Media' }).click();
    await expect(page).toHaveURL(/\/dashboard\?view=media$/);
    await expect(chat).toBeHidden();
    await expect(page.getByRole('tabpanel', { name: 'Media' }).getByRole('button', { name: /^Apri / })).toHaveCount(3);

    await page.getByRole('button', { name: 'Vai a Preventivo' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Preventivo' })).toContainText('Rimozione piastrelle');

    // "Casa" names both the section (first row) and the tab of its details (second row).
    await page.getByRole('button', { name: 'Vai a Casa' }).nth(1).click();
    await expect(page.getByRole('tabpanel', { name: 'Casa' }).getByRole('heading', { name: /Dettagli della Casa/ })).toBeVisible();

    await page.getByRole('button', { name: 'Vai a Chat' }).click();
    await expect(chat).toBeVisible();
  });
});
