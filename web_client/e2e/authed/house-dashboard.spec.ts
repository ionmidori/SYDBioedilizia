import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { consentCookie } from '../theme/pages';
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

  test('on a desktop: floating chat opens beside the tabs of the house', async ({ page, uid }) => {
    await stubHouseBackend(page, uid);
    await page.goto('/dashboard', { waitUntil: 'load' });

    const toggle = page.getByRole('button', { name: 'Apri chat' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('data-welcome-badge', 'off');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'syd-chat-window');
    await expect(page.getByTestId('chat-window')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');

    const media = page.getByRole('tabpanel', { name: 'Media' });
    await expect(media.getByRole('button', { name: /^Apri / })).toHaveCount(3);

    await media.getByRole('button', { name: /^Bagno/ }).click();
    await expect(media.getByRole('button', { name: /^Apri / })).toHaveCount(1);
    await expect(media.getByRole('button', { name: 'Apri bagno.png' })).toBeVisible();

    await media.getByRole('button', { name: /^Senza stanza/ }).click();
    await expect(media.getByRole('button', { name: 'Apri pianta.pdf' })).toBeVisible();

    await toggle.click();
    const chatDialog = page.getByTestId('chat-window');
    await expect(chatDialog).toHaveCount(1);
    await expect(chatDialog).toBeVisible();
    await expect(chatDialog).toHaveAttribute('role', 'dialog');
    await expect(chatDialog).toHaveAttribute('id', 'syd-chat-window');
    await expect(chatDialog).toContainText(SEEDED_MESSAGES[1].content);
    await expect(page.getByRole('button', { name: 'Chiudi chat' })).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(chatDialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apri chat' })).toBeFocused();

    // Header CTA opens the same floating chat and the header minimize control closes it cleanly.
    await page.getByRole('button', { name: 'Chiedi a SYD' }).click();
    await expect(chatDialog).toBeVisible();
    await page.getByRole('button', { name: 'Riduci la chat' }).click();
    await expect(chatDialog).toHaveCount(0);
  });

  test('on a desktop: legacy ?view=chat lands on Media tab and opens the floating chat', async ({ page, uid }) => {
    await stubHouseBackend(page, uid);
    await page.goto('/dashboard?view=chat', { waitUntil: 'load' });

    await expect(page.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
    const media = page.getByRole('tabpanel', { name: 'Media' });
    await expect(media).toBeVisible();
    await expect(media.getByRole('button', { name: /^Apri / })).toHaveCount(3);

    const chatDialog = page.getByTestId('chat-window');
    await expect(chatDialog).toHaveCount(1);
    await expect(chatDialog).toBeVisible();
    await expect(chatDialog).toHaveAttribute('role', 'dialog');
    await expect(chatDialog).toHaveAttribute('id', 'syd-chat-window');
    await expect(chatDialog).toContainText(SEEDED_MESSAGES[1].content);

    await page.keyboard.press('Escape');
    await expect(chatDialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apri chat' })).toBeFocused();
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

  test('on a desktop: the next revision of a quote received goes to the team, the quote received stays', async ({ page, uid }) => {
    // Phase 139 PR-3: the client asked for more work in the chat after the quote was sent.
    const { submits } = await stubHouseBackend(page, uid);
    let revisionState = 'draft';
    const received = { ...draftQuote(uid, 'sent'), version: 3, sent_at: '2026-10-12T09:00:00Z' };
    await page.route(`**/api/py/quote/${USER_CHAT_ID}`, jsonRoute(received));
    await page.route('**/api/py/quote/user/**', jsonRoute([{
      project_id: USER_CHAT_ID, project_name: '', quote_number: 'PRV-2026-0007', status: 'sent',
      grand_total: 2440, item_count: 2, updated_at: '2026-10-12T09:00:00Z', pdf_available: true,
    }]));
    await page.route(`**/api/py/quote/${USER_CHAT_ID}/history`, (route: Route) => jsonRoute({
      // Like the backend: the lines only while it is the client's draft.
      in_progress: revisionState === 'draft'
        ? {
          state: revisionState,
          items: [item('Porta nuova', 'bagno')],
          rooms: [{ room_id: 'bagno', room_label: 'Bagno', room_type: 'bagno', room_subtotal: 0 }],
        }
        : { state: revisionState, items: [], rooms: [] },
      sent: [
        { revision: 3, sent_at: '2026-10-12T09:00:00Z', grand_total: 2440, pdf_available: true },
        { revision: 2, sent_at: '2026-10-05T09:00:00Z', grand_total: 1464, pdf_available: true },
      ],
    })(route));
    await page.route(`**/api/py/quote/${USER_CHAT_ID}/submit`, (route: Route) => {
      submits.push(route.request().headers()['idempotency-key'] ?? '');
      revisionState = 'with_team';
      return jsonRoute({ project_id: USER_CHAT_ID, status: 'pending_review', quote_number: 'PRV-2026-0007', duplicate: false })(route);
    });
    await page.goto('/dashboard?view=quote', { waitUntil: 'load' });

    const quote = page.getByRole('tabpanel', { name: 'Preventivo' });
    const revision = quote.getByRole('region', { name: 'Nuova revisione' });
    await expect(revision).toContainText('Porta nuova');
    await expect(revision).not.toContainText('€');
    await expect(quote.getByTestId('quote-card')).toHaveAttribute('data-quote-status', 'sent');
    await expect(quote.getByRole('region', { name: 'Revisioni precedenti' })).toContainText('Rev. 2');

    await revision.getByTestId('submit-quote-button').click();
    const dialog = page.getByRole('dialog', { name: 'Invia al team' });
    await dialog.getByRole('button', { name: 'Invia al team' }).click();
    await expect(dialog.getByRole('status')).toContainText('Richiesta inviata');
    await page.keyboard.press('Escape');

    expect(submits).toHaveLength(1);
    await expect(revision).toContainText('Inviata al team, in revisione');
    await expect(revision).not.toContainText('Porta nuova');
    await expect(quote.getByTestId('submit-quote-button')).toHaveCount(0);
    await expect(quote.getByTestId('quote-card')).toHaveAttribute('data-quote-status', 'sent');
  });

  test('on a phone: tabs switch cleanly and floating chat opens across client routes without blocking bottom CTAs', async ({ page, context, baseURL, uid }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Dismiss GDPR CookieConsent banner (`z-[80]`) so bottom CTAs remain unobscured during scroll-bottom clicks.
    await context.addCookies([consentCookie(baseURL!)]);
    // The first visit on a phone shows the tour of the house: seen already.
    await page.addInitScript(() => localStorage.setItem('syd_house_tour_completed', 'true'));
    await stubHouseBackend(page, uid);
    await page.route('**/api/py/passkey/check', jsonRoute({ has_passkeys: false }));
    await page.goto('/dashboard', { waitUntil: 'load' });

    await expect(page.getByRole('button', { name: 'Vai a Chat' })).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Apri chat' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('data-welcome-badge', 'off');
    await expect(page.getByTestId('chat-window')).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: 'Media' }).getByRole('button', { name: /^Apri / })).toHaveCount(3);

    await page.getByRole('button', { name: 'Vai a Preventivo' }).click();
    await expect(page).toHaveURL(/\/dashboard\?view=quote$/);
    await expect(page.getByRole('tabpanel', { name: 'Preventivo' })).toContainText('Rimozione piastrelle');

    await page.getByRole('button', { name: 'Vai a Media' }).click();
    await expect(page).toHaveURL(/\/dashboard\?view=media$/);
    await expect(page.getByRole('tabpanel', { name: 'Media' }).getByRole('button', { name: /^Apri / })).toHaveCount(3);

    // "Casa" names both the section (first row) and the tab of its details (second row).
    await page.getByRole('button', { name: 'Vai a Casa' }).nth(1).click();
    await expect(page).toHaveURL(/\/dashboard\?view=house$/);
    await expect(page.getByRole('tabpanel', { name: 'Casa' }).getByRole('heading', { name: /Dettagli della Casa/ })).toBeVisible();

    const noHouseOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noHouseOverflow).toBe(true);

    // Open floating chat from Casa without losing the current URL/tab, then close cleanly.
    await toggle.click();
    const chat = page.getByTestId('chat-window');
    await expect(chat).toBeVisible();
    await expect(chat).toHaveAttribute('role', 'dialog');
    await expect(chat).toHaveAttribute('id', 'syd-chat-window');
    await expect(chat).toContainText(SEEDED_MESSAGES[1].content);
    await expect(page).toHaveURL(/\/dashboard\?view=house$/);

    await page.getByRole('button', { name: 'Riduci la chat' }).click();
    await expect(chat).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard\?view=house$/);

    // Scroll to bottom and verify bottom CTA clickability is unblocked by the closed ChatToggleButton.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const saveHouseBtn = page.getByRole('button', { name: 'Salva Configurazione' });
    await expect(saveHouseBtn).toBeVisible();
    const saveHouseBox = await saveHouseBtn.boundingBox();
    const toggleHouseBox = await toggle.boundingBox();
    expect(saveHouseBox).not.toBeNull();
    expect(toggleHouseBox).not.toBeNull();
    expect(saveHouseBox!.y + saveHouseBox!.height).toBeLessThanOrEqual(toggleHouseBox!.y);
    await saveHouseBtn.click();
    await expect(page.getByText('Inserisci la metratura')).toBeVisible();

    // Verify floating chat & bottom clearance on /dashboard/quotes.
    await page.goto('/dashboard/quotes', { waitUntil: 'load' });
    await expect(page.getByTestId('quotes-page')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(toggle).toHaveAttribute('data-welcome-badge', 'off');
    await toggle.click();
    await expect(chat).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/quotes$/);
    await page.getByRole('button', { name: 'Riduci la chat' }).click();
    await expect(chat).toHaveCount(0);

    // Verify floating chat, zero overflow, and bottom CTA clickability on /dashboard/profile.
    await page.goto('/dashboard/profile', { waitUntil: 'load' });
    const saveProfileBtn = page.getByRole('button', { name: 'Salva Modifiche' });
    await expect(saveProfileBtn).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await expect(toggle).toHaveAttribute('data-welcome-badge', 'off');
    await toggle.click();
    await expect(chat).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await page.getByRole('button', { name: 'Riduci la chat' }).click();
    await expect(chat).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const saveProfileBox = await saveProfileBtn.boundingBox();
    const toggleProfileBox = await toggle.boundingBox();
    expect(saveProfileBox).not.toBeNull();
    expect(toggleProfileBox).not.toBeNull();
    expect(saveProfileBox!.y + saveProfileBox!.height).toBeLessThanOrEqual(toggleProfileBox!.y);
    await saveProfileBtn.click({ trial: true });
  });
});
