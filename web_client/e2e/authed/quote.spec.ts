import { test, expect, jsonRoute } from './fixtures/authed-test';
import { QUOTES_FIXTURE } from './fixtures/constants';

/**
 * The client "Preventivi" area.
 *
 * Regression cover for three production bugs that shipped despite green unit
 * tests, because each lived in the seam between tiers:
 *  - #231 `/dashboard/quotes` was parsed as a project id by the sidebar
 *  - #232 the quote/batch routers were not mounted under `/api` -> 404
 *  - #239 the PDF signed URL was minted already-expired
 *
 * This spec also proves the auth-token cookie mechanism end to end: if it is
 * wrong, proxy.ts redirects to `/` and the first assertion fails immediately.
 */
test.describe('quotes area', () => {
  test('renders approved and pending quotes and hides drafts', async ({ page, uid }) => {
    await page.route(`**/api/py/quote/user/${uid}`, jsonRoute(QUOTES_FIXTURE));

    await page.goto('/dashboard/quotes', { waitUntil: 'load' });

    // Not bounced to '/' -> the middleware auth guard accepted our cookie.
    await expect(page).toHaveURL(/\/dashboard\/quotes$/);
    await expect(page.getByTestId('quotes-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Preventivi');

    // The draft is filtered out client-side; the other two render.
    await expect(page.getByTestId('quote-card')).toHaveCount(2);

    const approved = page.locator('[data-testid="quote-card"][data-quote-status="approved"]');
    await expect(approved).toHaveCount(1);
    await expect(approved).toContainText('Bagno Trastevere');
    await expect(approved.getByTestId('quote-download-pdf')).toBeVisible();

    const pending = page.locator('[data-testid="quote-card"][data-quote-status="pending_review"]');
    await expect(pending).toHaveCount(1);
    // Totals stay masked until an admin approves.
    await expect(pending.getByTestId('quote-download-pdf')).toHaveCount(0);
  });

  test('downloads the PDF through a freshly minted signed URL', async ({ page, context, uid }) => {
    const pdfUrl = 'https://signed.example.test/quote.pdf?sig=abc';

    await page.route(`**/api/py/quote/user/${uid}`, jsonRoute(QUOTES_FIXTURE));
    await page.route(
      '**/api/py/quote/proj-approved/pdf',
      jsonRoute({ pdf_url: pdfUrl, expires_in_seconds: 900 }),
    );
    // Context-level so it also covers the popup window. Served as HTML rather
    // than application/pdf: Chrome downloads a PDF instead of navigating to it,
    // which leaves the popup blank and unassertable.
    let requestedPdfUrl: string | null = null;
    await context.route('https://signed.example.test/**', (route) => {
      requestedPdfUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>pdf</html>' });
    });

    await page.goto('/dashboard/quotes', { waitUntil: 'load' });

    const approved = page.locator('[data-testid="quote-card"][data-quote-status="approved"]');
    const popupPromise = context.waitForEvent('page'); // QuoteListClient uses window.open
    await approved.getByTestId('quote-download-pdf').click();
    await popupPromise;

    // Assert on the request rather than popup.url(): window.open uses
    // 'noopener', so the popup is a detached context whose URL Playwright
    // cannot reliably read. What matters is that the browser actually fetched
    // the freshly minted signed URL — the step that was broken in #239.
    await expect.poll(() => requestedPdfUrl).toContain('signed.example.test/quote.pdf');
    await expect(page.getByTestId('quote-download-error')).toHaveCount(0);
  });

  test('surfaces an error when the PDF endpoint fails', async ({ page, uid }) => {
    // What #239 looked like from the client: the endpoint 404s (or the URL is
    // already expired) and the user must be told, not left with a dead button.
    await page.route(`**/api/py/quote/user/${uid}`, jsonRoute(QUOTES_FIXTURE));
    await page.route('**/api/py/quote/proj-approved/pdf', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not found"}' }),
    );

    await page.goto('/dashboard/quotes', { waitUntil: 'load' });
    const approved = page.locator('[data-testid="quote-card"][data-quote-status="approved"]');
    await approved.getByTestId('quote-download-pdf').click();

    await expect(page.getByTestId('quote-download-error')).toBeVisible();
  });

  test('shows the empty state when there are no quotes', async ({ page, uid }) => {
    await page.route(`**/api/py/quote/user/${uid}`, jsonRoute([]));

    await page.goto('/dashboard/quotes', { waitUntil: 'load' });

    await expect(page.getByTestId('quotes-empty')).toBeVisible();
    await expect(page.getByTestId('quote-card')).toHaveCount(0);
  });
});
