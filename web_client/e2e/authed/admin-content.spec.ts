import type { Page, Route } from '@playwright/test';

import { test, expect } from './fixtures/authed-test';

/**
 * Admin console: reviews, portfolio (with image upload) and GDPR.
 *
 * The real app, proxy and layout gate against the Auth emulator; the FastAPI
 * backend is a small stateful fake. Server-side rules (image validation and
 * cleaning, transactions, indexes) are covered by pytest.
 */

const IMAGE = 'https://firebasestorage.googleapis.com/v0/b/demo-bucket/o/portfolio%2F1700_foto.webp?alt=media';
// 1x1 transparent PNG, served as the "stored" image
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Review {
  id: string;
  name: string;
  location: string;
  text: string;
  rating: number;
  status: 'pending' | 'approved' | 'rejected';
}
interface Project {
  id: string;
  title: string;
  category: string;
  location: string;
  description: string;
  stats: { area: string; duration: string; budget: string };
  image_url: string;
  active: boolean;
  order: number;
}
interface Fake {
  reviews: Review[];
  projects: Project[];
  moderations: { id: string; body: Record<string, unknown> }[];
  uploads: { contentType: string }[];
  created: Record<string, unknown>[];
  patches: { id: string; body: Record<string, unknown> }[];
  deleted: string[];
  gdprRuns: number;
}

async function installFakeBackend(page: Page): Promise<Fake> {
  const f: Fake = {
    reviews: [
      { id: 't1', name: 'Anna', location: 'Roma', text: 'Ottimo lavoro!', rating: 5, status: 'pending' },
      { id: 't2', name: 'Luca', location: 'Milano', text: '<b>Bravi</b>', rating: 4, status: 'approved' },
    ],
    projects: [],
    moderations: [],
    uploads: [],
    created: [],
    patches: [],
    deleted: [],
    gdprRuns: 0,
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const stats = () => ({
    pending: f.reviews.filter((r) => r.status === 'pending').length,
    approved: f.reviews.filter((r) => r.status === 'approved').length,
    rejected: f.reviews.filter((r) => r.status === 'rejected').length,
  });

  await page.route(IMAGE, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/api/py/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/py/admin', '');
    const method = request.method();

    if (path === '/me') return json(route, 200, { uid: 'admin-uid', email: 'e2e@syd.test', role: 'admin', mfa: false });

    if (path === '/testimonials' && method === 'GET') {
      const status = url.searchParams.get('status');
      return json(route, 200, { items: f.reviews.filter((r) => r.status === status), stats: stats() });
    }
    const moderate = path.match(/^\/testimonials\/([^/]+)\/moderate$/);
    if (moderate && method === 'POST') {
      const body = request.postDataJSON() as { decision: string; notes: string | null };
      f.moderations.push({ id: moderate[1], body });
      const review = f.reviews.find((r) => r.id === moderate[1])!;
      review.status = body.decision === 'approve' ? 'approved' : 'rejected';
      return json(route, 200, { id: review.id, status: review.status, stats: stats() });
    }

    if (path === '/portfolio' && method === 'GET') {
      return json(route, 200, { items: f.projects, visible: f.projects.filter((p) => p.active).length });
    }
    if (path === '/portfolio/image' && method === 'POST') {
      f.uploads.push({ contentType: request.headers()['content-type'] ?? '' });
      return json(route, 201, { image_url: IMAGE, width: 1, height: 1, size_bytes: PNG.length });
    }
    if (path === '/portfolio' && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      f.created.push(body);
      const project = { id: `p${f.projects.length + 1}`, order: f.projects.length + 1, ...body } as unknown as Project;
      f.projects.push(project);
      return json(route, 201, project);
    }
    const one = path.match(/^\/portfolio\/([^/]+)$/);
    if (one && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      f.patches.push({ id: one[1], body });
      const project = f.projects.find((p) => p.id === one[1])!;
      Object.assign(project, body);
      return json(route, 200, project);
    }
    if (one && method === 'DELETE') {
      f.deleted.push(one[1]);
      f.projects = f.projects.filter((p) => p.id !== one[1]);
      return route.fulfill({ status: 204 });
    }

    if (path === '/gdpr/status') {
      return json(route, 200, {
        phases: [
          { phase: 1, months_inactive: 12, action: 'Email di avviso inattività' },
          { phase: 2, months_inactive: 13, action: 'Account disabilitato' },
          { phase: 3, months_inactive: 24, action: 'Dati personali anonimizzati' },
        ],
        scheduler_secret_configured: true,
      });
    }
    if (path === '/gdpr/lifecycle/run' && method === 'POST') {
      f.gdprRuns += 1;
      return json(route, 200, { status: 'ok', warned: 2, disabled: 1, anonymized: 0, errors: [] });
    }
    return json(route, 404, { error_code: 'NOT_MOCKED', message: `${method} ${path}` });
  });
  return f;
}

test.describe('admin console — reviews, portfolio, GDPR', () => {
  test('publish a pending review; visitor text is shown as text', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/testimonials', { waitUntil: 'load' });

    await expect(page.getByTestId('review-card')).toHaveCount(1);
    await expect(page.getByTestId('review-name')).toHaveText('Anna');
    await page.getByLabel('Nota interna (facoltativa)').fill('Verificata');
    await page.getByTestId('review-approve').click();

    await expect(page.getByTestId('reviews-empty')).toBeVisible(); // it left the pending list
    expect(fake.moderations).toEqual([{ id: 't1', body: { decision: 'approve', notes: 'Verificata' } }]);

    await page.getByTestId('tab-approved').click();
    await expect(page.getByTestId('review-card')).toHaveCount(2);
    // markup in a review is text, never HTML
    await expect(page.getByTestId('review-text').filter({ hasText: '<b>Bravi</b>' })).toBeVisible();
    await expect(page.locator('[data-testid="review-text"] b')).toHaveCount(0);
  });

  test('add a portfolio project with an image, hide it, then delete it', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/portfolio', { waitUntil: 'load' });
    await expect(page.getByTestId('portfolio-empty')).toBeVisible();

    await page.getByTestId('portfolio-add').click();
    // saving without an image is stopped with a clear message
    await page.getByTestId('portfolio-title').fill('Bagno Trastevere');
    await page.getByTestId('portfolio-location').fill('Roma');
    await page.getByTestId('portfolio-save').click();
    await expect(page.getByTestId('portfolio-problems')).toContainText('immagine');

    await page.getByTestId('portfolio-file').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('portfolio-preview')).toHaveAttribute('src', IMAGE);
    expect(fake.uploads[0].contentType).toContain('multipart/form-data');

    await page.getByTestId('portfolio-save').click();
    await expect(page.getByTestId('portfolio-card')).toHaveCount(1);
    expect(fake.created[0]).toMatchObject({ title: 'Bagno Trastevere', location: 'Roma', image_url: IMAGE, active: true });

    await page.getByTestId('portfolio-toggle').click();
    await expect(page.getByTestId('portfolio-hidden')).toBeVisible();
    expect(fake.patches).toEqual([{ id: 'p1', body: { active: false } }]);

    await page.getByRole('button', { name: 'Elimina Bagno Trastevere' }).click();
    await page.getByTestId('portfolio-delete-confirm').click();
    await expect(page.getByTestId('portfolio-empty')).toBeVisible();
    expect(fake.deleted).toEqual(['p1']);
  });

  test('the GDPR check asks first, then shows what it did', async ({ page }) => {
    const fake = await installFakeBackend(page);
    await page.goto('/admin/gdpr', { waitUntil: 'load' });
    await expect(page.getByTestId('gdpr-phases')).toContainText('24 mesi');

    await page.getByTestId('gdpr-run').click();
    expect(fake.gdprRuns).toBe(0); // the confirmation comes first
    await page.getByTestId('gdpr-confirm').click();
    await expect(page.getByTestId('gdpr-result')).toContainText('Completato senza errori');
    await expect(page.getByTestId('gdpr-result')).toContainText('2');
    expect(fake.gdprRuns).toBe(1);
  });

  test('the console menu reaches every section', async ({ page }) => {
    await installFakeBackend(page);
    await page.goto('/admin/gdpr', { waitUntil: 'load' });
    for (const [name, url] of [
      ['Recensioni', /\/admin\/testimonials$/],
      ['Portfolio', /\/admin\/portfolio$/],
      ['GDPR', /\/admin\/gdpr$/],
    ] as const) {
      await page.getByRole('navigation', { name: 'Sezioni della console' }).getByRole('link', { name }).click();
      await expect(page).toHaveURL(url);
    }
  });
});
