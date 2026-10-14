import type { Route } from '@playwright/test';

import { test, expect } from './fixtures/authed-test';

/**
 * Admin console: from the inbox to the email.
 *
 * Runs against the real Next.js app, the real proxy/layout gate and the Auth
 * emulator (the seeded user carries `role=admin`, see auth.setup.ts). The
 * FastAPI backend is replaced by a small stateful fake that enforces the
 * contract that matters to the UI: If-Match on edit/approve (409 when stale)
 * and Idempotency-Key on send. Backend behaviour itself is covered by pytest.
 */

const PID = 'proj-e2e';
const PHOTO = 'https://storage.googleapis.com/e2e-bucket/foto-1.png';
// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Fake {
  version: number;
  status: 'pending_review' | 'approved' | 'sent' | 'in_review';
  qty: number;
  revisions: number[];
  approvedRevision: number | null;
  edits: { ifMatch: string | null; qty: number }[];
  approvals: (string | null)[];
  reopens: string[];
  sends: { headers: Record<string, string>; body: Record<string, unknown> }[];
  /** Next PATCH answers 409 (somebody else saved first). */
  conflictOnNextEdit: boolean;
  /** The next dossier GET answers late (a real network): exposes UI races after a write. */
  slowNextDossier: boolean;
  /** The quote has gone out at least once (stays true while it is revised). */
  sentOnce: boolean;
}

const UNIT_PRICE = 12.5;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function dossier(f: Fake) {
  const subtotal = money(f.qty * UNIT_PRICE);
  const vat = money(subtotal * 0.22);
  return {
    project_id: PID,
    project_name: 'Bagno Trastevere',
    etag: `"v${f.version}"`,
    client_live: null,
    client_profile_changed: false,
    media: [{ media_id: 'm1', kind: 'input_photo', label: 'Foto 1 — caricata in chat', url: PHOTO }],
    revisions: f.revisions.map((version) => ({
      version,
      actor_kind: version === 1 ? 'ai' : 'admin',
      created_at: '2026-10-10T14:26:00Z',
      change_count: 0,
    })),
    deliveries: f.sends.map((_, i) => ({
      delivery_id: `d${i}`,
      to: String(f.sends[i].body.to),
      cc: [],
      revision: f.approvedRevision ?? f.version,
      status: 'sent',
      provider: 'console',
      attempts: 1,
      created_by: 'admin',
      created_at: '2026-10-10T15:00:00Z',
    })),
    quote: {
      doc_type: 'quote',
      project_id: PID,
      user_id: 'client-1',
      quote_number: 'PRV-2026-0001',
      status: f.status,
      delivery_status: f.sends.length ? 'sent' : 'none',
      version: f.version,
      items: [
        {
          sku: 'PIT-001',
          description: 'Pittura pareti',
          unit: 'mq',
          qty: f.qty,
          unit_price: UNIT_PRICE,
          total: subtotal,
          manual_override: false,
        },
      ],
      financials: { subtotal, vat_rate: 0.22, vat_amount: vat, grand_total: money(subtotal + vat) },
      media: [],
      search_keys: [],
      request: { summary: 'Ridipingere il bagno di 6 mq', address: 'Via Roma 1, Roma', channel: 'chat' },
      client_snapshot: { uid: 'client-1', display_name: 'Mario Rossi', email: 'mario@example.it', is_guest: false },
      sent_at: f.sentOnce ? '2026-10-11T10:25:35Z' : null,
      review: f.approvedRevision ? { approved_revision: f.approvedRevision } : null,
      pdf_blob_path: f.approvedRevision ? 'projects/proj-e2e/quotes/PRV-2026-0001_r.pdf' : null,
      pdf_revision: f.approvedRevision,
      created_at: '2026-10-10T14:26:00Z',
    },
  };
}

function writeResponse(f: Fake, extra: Record<string, unknown> = {}) {
  return {
    project_id: PID,
    status: f.status,
    version: f.version,
    quote_number: 'PRV-2026-0001',
    etag: `"v${f.version}"`,
    ...extra,
  };
}

async function installFakeBackend(page: import('@playwright/test').Page, overrides: Partial<Fake> = {}): Promise<Fake> {
  const f: Fake = {
    version: 2,
    status: 'pending_review',
    qty: 10,
    revisions: [1, 2],
    approvedRevision: null,
    edits: [],
    approvals: [],
    reopens: [],
    sends: [],
    conflictOnNextEdit: false,
    slowNextDossier: false,
    sentOnce: false,
    ...overrides,
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(PHOTO, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/api/py/admin/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/py/admin', '');
    const method = request.method();

    if (path === '/me') {
      return json(route, 200, { uid: 'admin-uid', email: 'e2e@syd.test', role: 'admin', mfa: false });
    }
    if (path === '/quotes' && method === 'GET') {
      return json(route, 200, {
        items: [
          {
            project_id: PID,
            quote_number: 'PRV-2026-0001',
            client_display_name: 'Mario Rossi',
            client_email: 'mario@example.it',
            client_is_guest: false,
            status: f.status,
            delivery_status: 'none',
            grand_total: 152.5,
            item_count: 1,
            channel: 'chat',
            summary: 'Ridipingere il bagno di 6 mq',
            thumbnail_media_id: 'm1',
            updated_at: '2026-10-10T14:46:00Z',
          },
        ],
        next_cursor: null,
      });
    }
    if (path === `/quotes/${PID}` && method === 'GET') {
      if (f.slowNextDossier) {
        f.slowNextDossier = false;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      return json(route, 200, dossier(f));
    }

    if (path === `/quotes/${PID}` && method === 'PATCH') {
      const ifMatch = request.headers()['if-match'] ?? null;
      const body = request.postDataJSON() as { items?: { qty: number }[] };
      f.edits.push({ ifMatch, qty: body.items?.[0]?.qty ?? f.qty });
      if (f.conflictOnNextEdit || ifMatch !== `"v${f.version}"`) {
        f.conflictOnNextEdit = false;
        f.version += 1; // the other admin's save
        return json(route, 409, { error_code: 'VERSION_CONFLICT', message: 'changed' });
      }
      f.qty = body.items?.[0]?.qty ?? f.qty;
      f.version += 1;
      f.revisions.push(f.version);
      f.slowNextDossier = true;
      return json(route, 200, writeResponse(f));
    }
    if (path === `/quotes/${PID}/approve`) {
      const ifMatch = request.headers()['if-match'] ?? null;
      f.approvals.push(ifMatch);
      if (ifMatch !== `"v${f.version}"`) return json(route, 409, { error_code: 'VERSION_CONFLICT', message: 'changed' });
      f.status = 'approved';
      f.approvedRevision = f.version;
      return json(route, 200, writeResponse(f, { pdf_ready: true, pdf_preview_url: 'https://storage.googleapis.com/e2e-bucket/p.pdf' }));
    }
    if (path === `/quotes/${PID}/reopen`) {
      const body = request.postDataJSON() as { reason: string };
      f.reopens.push(body.reason);
      f.status = 'in_review';
      f.approvedRevision = null;
      f.version += 1; // revising a sent quote starts a new version
      f.revisions.push(f.version);
      return json(route, 200, writeResponse(f));
    }
    if (path === `/quotes/${PID}/send-defaults`) {
      return json(route, 200, {
        to: 'mario@example.it',
        to_source: 'snapshot',
        subject: 'Bozza di preventivo PRV-2026-0001 – SYD Bioedilizia',
        body_preview: 'Gentile Mario Rossi, in allegato la bozza di preventivo.',
        attachment_name: 'Bozza_preventivo_PRV-2026-0001.pdf',
        revision: f.approvedRevision ?? f.version,
        pdf_ready: true,
      });
    }
    if (path === `/quotes/${PID}/send` && method === 'POST') {
      f.sends.push({ headers: request.headers(), body: request.postDataJSON() as Record<string, unknown> });
      f.status = 'sent';
      f.sentOnce = true;
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          project_id: PID,
          delivery_id: 'd0',
          status: 'sent',
          delivery_status: 'sent',
          quote_number: 'PRV-2026-0001',
          duplicate: false,
        }),
      });
    }
    return json(route, 404, { error_code: 'NOT_MOCKED', message: `${method} ${path}` });
  });
  return f;
}

test.describe('admin console', () => {
  test('inbox → dossier → edit → approve → send to a different address', async ({ page }) => {
    const fake = await installFakeBackend(page);

    // Inbox: who asked, for what — not a uuid.
    await page.goto('/admin/quotes', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/admin\/quotes$/);
    const row = page.getByTestId('inbox-row');
    await expect(row.getByTestId('inbox-number')).toHaveText('PRV-2026-0001');
    await expect(row.getByTestId('inbox-client')).toHaveText('Mario Rossi');
    await row.getByRole('link').click();

    // Dossier: client, request, photo.
    await expect(page.getByTestId('dossier-number')).toHaveText('PRV-2026-0001');
    await expect(page.getByTestId('dossier-client')).toHaveText('Mario Rossi');
    await expect(page.getByTestId('request-summary')).toContainText('Ridipingere il bagno');
    await expect(page.getByTestId('gallery-thumb')).toBeVisible();
    await page.getByTestId('gallery-thumb').click();
    await expect(page.getByTestId('lightbox-image')).toBeVisible();
    await page.keyboard.press('Escape');

    // Edit: live total, save sends the ETag it was read with.
    await page.getByTestId('item-qty-0').fill('20');
    await expect(page.getByTestId('totals-grand')).toContainText('305,00');
    await expect(page.getByTestId('btn-approve')).toBeDisabled();
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('notice')).toContainText('revisione 3');
    // While the refreshed dossier is still on its way: no flash back to 10,
    // no false "modified by another admin", and nothing can be approved yet.
    await expect(page.getByTestId('item-qty-0')).toHaveValue('20');
    await expect(page.getByTestId('stale-banner')).toHaveCount(0);
    await expect(page.getByTestId('btn-approve')).toBeDisabled();
    expect(fake.edits).toEqual([{ ifMatch: '"v2"', qty: 20 }]);
    await expect(page.getByTestId('revision-item')).toHaveCount(3);
    await expect(page.getByTestId('btn-approve')).toBeEnabled();

    // Approve the version on screen.
    await page.getByTestId('btn-approve').click();
    await page.getByTestId('approve-confirm').click();
    await expect(page.getByTestId('dossier-status')).toHaveText('Approvato');
    expect(fake.approvals).toEqual(['"v3"']);

    // Send to an address the admin types.
    await page.getByTestId('btn-send').click();
    await expect(page.getByTestId('send-to')).toHaveValue('mario@example.it');
    await expect(page.getByTestId('send-subject')).toHaveValue(/PRV-2026-0001/);
    await page.getByTestId('send-to').fill('altro@example.it');
    await page.getByTestId('send-cc').fill('ufficio@example.it');
    await page.getByTestId('send-message').fill('Ci sentiamo lunedì.');
    await page.getByTestId('send-confirm').click();

    await expect(page.getByTestId('notice')).toContainText('altro@example.it');
    expect(fake.sends).toHaveLength(1);
    expect(fake.sends[0].body).toMatchObject({
      to: 'altro@example.it',
      cc: ['ufficio@example.it'],
      message: 'Ci sentiamo lunedì.',
    });
    expect(fake.sends[0].headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByTestId('delivery-item')).toContainText('altro@example.it');
  });

  test('a save that lost the race shows a reload banner instead of overwriting', async ({ page }) => {
    const fake = await installFakeBackend(page, { conflictOnNextEdit: true });

    await page.goto(`/admin/quotes/${PID}`, { waitUntil: 'load' });
    await page.getByTestId('item-qty-0').fill('30');
    await page.getByTestId('btn-save').click();

    const banner = page.getByTestId('error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-error-kind', 'conflict');

    await banner.getByRole('button', { name: 'Ricarica' }).click();
    // The other admin's version is shown; our unsaved 30 is gone.
    await expect(page.getByTestId('item-qty-0')).toHaveValue('10');
    await expect(page.getByTestId('error-banner')).toHaveCount(0);
    expect(fake.edits).toHaveLength(1);
  });

  test('a user without the admin claim never reaches the console', async ({ page, context, baseURL }) => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'none' })}.${encode({ sub: 'someone', exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
    await context.addCookies([{ name: 'auth-token', value: token, url: baseURL!, httpOnly: true, secure: false, sameSite: 'Lax' }]);

    await page.goto('/admin/quotes', { waitUntil: 'load' });
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('a quote already sent can be revised, with a warning, and goes out again as a new revision', async ({ page }) => {
    const fake = await installFakeBackend(page, {
      status: 'sent',
      version: 2,
      approvedRevision: 2,
      sentOnce: true,
      sends: [{ headers: {}, body: { to: 'mario@example.it' } }],
    });

    await page.goto(`/admin/quotes/${PID}`, { waitUntil: 'load' });
    await expect(page.getByTestId('dossier-status')).toHaveText('Inviato');
    await expect(page.getByTestId('item-qty-0')).toBeDisabled();

    await page.getByTestId('btn-revise').click();
    const warning = page.getByTestId('revise-warning');
    await expect(warning).toContainText('già stato inviato al cliente');
    await expect(warning).toContainText('mario@example.it');
    await expect(warning).toContainText('rev. 3');
    await expect(page.getByTestId('reason-confirm')).toBeDisabled();
    await page.getByTestId('reason-input').fill('Prezzo del materiale cambiato');
    await page.getByTestId('reason-confirm').click();

    await expect(page.getByTestId('dossier-status')).toHaveText('In revisione');
    expect(fake.reopens).toEqual(['Prezzo del materiale cambiato']);
    await expect(page.getByTestId('sent-before-banner')).toContainText('già stato inviato a mario@example.it');

    // now it can be edited again, as a new revision
    await page.getByTestId('item-qty-0').fill('15');
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('notice')).toContainText('revisione 4');
    await expect(page.getByTestId('btn-approve')).toBeEnabled();
  });
});
