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
  // Reveal-on-scroll content (Motion whileInView, e.g. the footer) renders only after it
  // has crossed the viewport once: walk the page down, then back to the top.
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await frame();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await frame();
  });
  // Only wait for the WelcomeBadge typewriter text on pages that actually mount the closed floating chat trigger.
  if ((await page.getByRole('button', { name: 'Apri chat' }).count()) > 0) {
    for (const { text, timeoutMs } of SETTLE_TEXTS) {
      await page.getByText(text, { exact: true }).waitFor({ timeout: timeoutMs }).catch(() => undefined);
    }
  }
  // Bounded: some pages keep a connection open (analytics, chat, Firestore emulator WebChannel), so networkidle may never come.
  await page.waitForLoadState('networkidle', { timeout: 1_000 }).catch(() => undefined);
}
