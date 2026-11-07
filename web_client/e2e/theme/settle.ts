import type { Page } from '@playwright/test';
import { SETTLE_TEXTS } from './extra-pages';

/** Bring a freshly loaded page to the same visual state on every run. */
export async function settle(page: Page) {
  // Lazy images load only near the viewport, i.e. at different times per run: load them all now.
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    images.forEach((img) => (img.loading = 'eager'));
    await Promise.all(images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
  });
  for (const { text, timeoutMs } of SETTLE_TEXTS) {
    await page.getByText(text, { exact: true }).waitFor({ timeout: timeoutMs }).catch(() => undefined);
  }
  // Bounded: some pages keep a connection open (analytics, chat), so networkidle may never come.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}
