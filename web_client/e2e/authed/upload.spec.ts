import { test, expect, jsonRoute } from './fixtures/authed-test';
import { chatStreamHandler } from './fixtures/ui-message-stream';

/**
 * Chat attachment upload.
 *
 * Asserts the limits the code actually enforces
 * (`lib/validation/file-upload-schema.ts` + `ChatInput`), NOT the ones quoted
 * in the roadmap — images cap at 10MB, and a single selection is capped at 3
 * files, not 5.
 *
 * Validation failures surface through `window.alert`, so they are asserted via
 * the dialog event rather than the DOM.
 */

const IMAGE_ASSET = {
  id: 'asset-1',
  asset_type: 'image' as const, // load-bearing: ChatWidget filters on this to build mediaUrls
  url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/e2e.jpg?alt=media',
  filename: 'e2e.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 2048,
  file_path: 'uploads/e2e.jpg',
  width: 64,
  height: 64,
  created_at: '2026-02-14T09:00:00Z',
};

/** Smallest valid PNG (1x1, transparent). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const pngFile = (name: string) => ({ name, mimeType: 'image/png', buffer: TINY_PNG });

/**
 * Collects `window.alert` messages.
 *
 * A registered `page.on('dialog')` handler that dismisses immediately is
 * required here: `alert()` blocks the page's JS, so waiting on the dialog with
 * `page.waitForEvent('dialog')` instead deadlocks the very call that triggered
 * it (setInputFiles never resolves).
 */
function collectDialogs(page: import('@playwright/test').Page): string[] {
  const messages: string[] = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss().catch(() => undefined);
  });
  return messages;
}

test.describe('chat file upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Apri chat' }).click();
    await expect(page.getByTestId('chat-window')).toBeVisible();
  });

  test('uploads an image and attaches it to the next message', async ({ page }) => {
    await page.route('**/api/py/upload/image', jsonRoute(IMAGE_ASSET));
    await page.route('**/api/chat', chatStreamHandler('Ho ricevuto la foto.'));

    await page.getByTestId('chat-file-input').setInputFiles(pngFile('room.png'));

    const preview = page.getByTestId('file-preview');
    await expect(preview).toHaveCount(1);
    // Await the state, never a timeout.
    await expect(preview).toHaveAttribute('data-upload-status', 'success');

    const chatRequest = page.waitForRequest((r) => r.url().includes('/api/chat'));
    await page.getByLabel('Messaggio chat').fill('Ecco la stanza');
    await page.getByRole('button', { name: 'Invia messaggio' }).click();

    expect((await chatRequest).postDataJSON().mediaUrls).toEqual([IMAGE_ASSET.url]);

    // Previews are cleared once the turn is submitted.
    await expect(page.getByTestId('file-preview')).toHaveCount(0);
  });

  test('rejects an image above the 10MB cap', async ({ page }) => {
    const alerts = collectDialogs(page);

    await page.getByTestId('chat-file-input').setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(11 * 1024 * 1024),
    });

    await expect
      .poll(() => alerts.join('\n'))
      .toContain('Le immagini non possono superare i 10MB');

    await expect(page.getByTestId('file-preview')).toHaveCount(0);
  });

  test('rejects an unsupported file type', async ({ page }) => {
    const alerts = collectDialogs(page);

    await page.getByTestId('chat-file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });

    await expect.poll(() => alerts.join('\n')).toContain('Tipo di file non supportato');

    await expect(page.getByTestId('file-preview')).toHaveCount(0);
  });

  test('caps a single selection at 3 files', async ({ page }) => {
    await page.route('**/api/py/upload/image', jsonRoute(IMAGE_ASSET));
    const alerts = collectDialogs(page);

    await page
      .getByTestId('chat-file-input')
      .setInputFiles([pngFile('a.png'), pngFile('b.png'), pngFile('c.png'), pngFile('d.png')]);

    await expect.poll(() => alerts.join('\n')).toContain('al massimo 3 file');

    // The first 3 are still accepted — the cap truncates, it does not abort.
    await expect(page.getByTestId('file-preview')).toHaveCount(3);
  });

  test('surfaces a failed upload instead of dropping it silently', async ({ page }) => {
    await page.route('**/api/py/upload/image', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' }),
    );

    await page.getByTestId('chat-file-input').setInputFiles(pngFile('room.png'));

    await expect(page.getByTestId('file-preview')).toHaveAttribute('data-upload-status', 'error');
  });
});
