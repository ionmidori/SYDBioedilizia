import type { Page, Route } from '@playwright/test';

import { test, expect } from './fixtures/authed-test';

/**
 * Admin console: dashboard and price book.
 *
 * Same approach as admin-quotes.spec.ts: the real app, proxy and layout gate
 * against the Auth emulator; the FastAPI backend is a small stateful fake that
 * enforces the contract the UI relies on (If-Match on save → 409 when stale,
 * the SKU rule → 422). Backend behaviour itself is covered by pytest.
 */

type Line = {
  sku: string;
  description: string;
  unit: string;
  unit_price: number;
  category: string;
  vat_agevolata: boolean;
  tags: string[];
};

const line = (sku: string, description: string, unit_price: number, category: string): Line => ({
  sku,
  description,
  unit: 'mq',
  unit_price,
  category,
  vat_agevolata: false,
  tags: [],
});

interface Fake {
  version: number;
  items: Line[];
  puts: { ifMatch: string | null; items: Line[]; reason: string | null }[];
  /** Answer the next PUT with this error instead of saving. */
  failNext: { status: number; body: unknown } | null;
  /** The next book GET answers late, like a real network. */
  slowNextGet: boolean;
}

async function installFakeBackend(page: Page): Promise<Fake> {
  const f: Fake = {
    version: 0,
    items: [
      line('DEM-001', 'Demolizione tramezzi', 25, 'Demolizioni'),
      line('BAG-001', 'Sanitari sospesi', 300, 'Bagno'),
    ],
    puts: [],
    failNext: null,
    slowNextGet: false,
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/py/admin/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/py/admin', '');

    if (path === '/me') return json(route, 200, { uid: 'admin-uid', email: 'e2e@syd.test', role: 'admin', mfa: false });
    if (path === '/kpis') {
      return json(route, 200, {
        by_status: { draft: 1, pending_review: 2, in_review: 1, approved: 3, sent: 2, rejected: 1 },
        pending_value: 1234.5,
        pending_truncated: false,
        weekly_approvals: Array.from({ length: 8 }, (_, i) => ({
          week_start: `2026-08-${String(10 + i * 7).padStart(2, '0')}`,
          approvals: i === 7 ? 4 : i === 5 ? 1 : 0,
        })),
        recent_approvals: [
          { project_id: 'proj-e2e', quote_number: 'PRV-2026-0001', client_display_name: 'Mario Rossi', grand_total: 488 },
        ],
        testimonials: { pending: 2, approved: 5, rejected: 0 },
        generated_at: '2026-10-14T12:00:00Z',
      });
    }
    if (path === '/price-book' && request.method() === 'GET') {
      if (f.slowNextGet) {
        f.slowNextGet = false;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      return json(route, 200, {
        etag: `"v${f.version}"`,
        version: f.version,
        source: f.version === 0 ? 'seed' : 'firestore',
        item_count: f.items.length,
        items: f.items,
      });
    }
    if (path === '/price-book' && request.method() === 'PUT') {
      const body = request.postDataJSON() as { items: Line[]; reason: string | null };
      f.puts.push({ ifMatch: request.headers()['if-match'] ?? null, items: body.items, reason: body.reason ?? null });
      if (f.failNext) {
        const failure = f.failNext;
        f.failNext = null;
        return json(route, failure.status, failure.body);
      }
      if (request.headers()['if-match'] !== `"v${f.version}"`) {
        return json(route, 409, { error_code: 'VERSION_CONFLICT', message: 'changed' });
      }
      const added = body.items.filter((i) => !f.items.some((o) => o.sku === i.sku)).length;
      const changed = body.items.filter((i) => f.items.some((o) => o.sku === i.sku && o.unit_price !== i.unit_price)).length;
      f.items = body.items;
      f.version += 1;
      f.slowNextGet = true;
      return json(route, 200, { etag: `"v${f.version}"`, version: f.version, item_count: f.items.length, added, removed: 0, changed });
    }
    if (path === '/price-book/history') return json(route, 200, { items: [] });
    return json(route, 404, { error_code: 'NOT_MOCKED', message: `${request.method()} ${path}` });
  });
  return f;
}

test.describe('admin console — dashboard and price book', () => {
  test('the dashboard opens with the numbers and leads to the other sections', async ({ page }) => {
    await installFakeBackend(page);
    await page.goto('/admin', { waitUntil: 'load' });

    await expect(page.getByTestId('kpi-to-work')).toHaveText('3'); // pending_review + in_review
    await expect(page.getByTestId('kpi-approved')).toHaveText('5'); // approved + sent
    await expect(page.getByTestId('kpi-pending-value')).toContainText('1234,50');
    await expect(page.getByTestId('weekly-bars')).toBeVisible();
    await expect(page.getByTestId('recent-approvals')).toContainText('PRV-2026-0001');

    await page.getByRole('link', { name: 'Listino' }).click();
    await expect(page).toHaveURL(/\/admin\/price-book$/);
    await expect(page.getByTestId('price-book')).toBeVisible();
  });

  test('edit a price, review the change, save with the version that was read', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/price-book', { waitUntil: 'load' });
    await expect(page.getByTestId('pb-row')).toHaveCount(2);

    await page.getByTestId('pb-price-0').fill('30');
    await expect(page.getByTestId('pb-save')).toContainText('Salva (1)');
    await page.getByTestId('pb-save').click();
    await expect(page.getByTestId('save-counts')).toContainText('Modificate');
    await page.getByTestId('save-reason').fill('Prezzi 2026');
    await page.getByTestId('save-confirm').click();

    await expect(page.getByTestId('notice')).toContainText('versione 1');
    // while the refreshed book is still on its way: the new price stays, no false conflict
    await expect(page.getByTestId('pb-price-0')).toHaveValue('30');
    await expect(page.getByTestId('stale-banner')).toHaveCount(0);
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0].ifMatch).toBe('"v0"');
    expect(fake.puts[0].reason).toBe('Prezzi 2026');
    expect(fake.puts[0].items[0]).toMatchObject({ sku: 'DEM-001', unit_price: 30 });

    // once it has arrived the editor is clean again
    await expect(page.getByTestId('pb-save')).toBeDisabled();
    await expect(page.getByTestId('pb-price-0')).toHaveValue('30');
  });

  test('a save that lost the race asks to reload instead of overwriting', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/price-book', { waitUntil: 'load' });
    fake.failNext = { status: 409, body: { error_code: 'VERSION_CONFLICT', message: 'changed' } };

    await page.getByTestId('pb-price-1').fill('999');
    await page.getByTestId('pb-save').click();
    await page.getByTestId('save-confirm').click();

    const banner = page.getByTestId('error-banner');
    await expect(banner).toHaveAttribute('data-error-kind', 'conflict');
    await banner.getByRole('button', { name: 'Ricarica' }).click();
    await expect(page.getByTestId('pb-price-1')).toHaveValue('300'); // our unsaved 999 is gone
  });

  test('removing a SKU the AI recipes use is explained, not silently refused', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/price-book', { waitUntil: 'load' });
    fake.failNext = { status: 422, body: { error_code: 'PRICE_BOOK_SKU_IN_USE', message: 'x', detail: { skus: ['DEM-001'] } } };

    await page.getByRole('button', { name: 'Elimina la voce DEM-001' }).click();
    await page.getByTestId('pb-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('error-banner')).toContainText('DEM-001');
  });

  test('invalid lines are flagged before anything is sent', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/price-book', { waitUntil: 'load' });

    await page.getByTestId('pb-sku-1').fill('DEM-001'); // duplicate
    await page.getByTestId('pb-save').click();
    await expect(page.getByTestId('pb-issues')).toBeVisible();
    await expect(page.getByText('SKU duplicato')).toBeVisible();
    expect(fake.puts).toHaveLength(0);
  });
});
