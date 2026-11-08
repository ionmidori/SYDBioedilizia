import { createRequire } from 'node:module';
import type { AxeResults } from 'axe-core';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { visit, type ThemePage } from './pages';
import type { ThemeState } from './states';

/**
 * The two checks the theme harness runs on every page and state, shared by the
 * public (playwright.config.ts) and signed-in (playwright.emulator.config.ts) suites.
 */

const AXE_SOURCE = createRequire(__filename).resolve('axe-core/axe.min.js');

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function screenshot(page: Page, name: string, mask: readonly string[]) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    mask: mask.map((selector) => page.locator(selector)),
    maxDiffPixelRatio: 0.002,
  });
}

async function audit(page: Page, name: string, testInfo: TestInfo) {
  // axe-core injected directly (no @axe-core/playwright: its playwright-core peer
  // pulls a second Playwright version whose Page type clashes with ours).
  await page.addScriptTag({ path: AXE_SOURCE });
  const results = await page.evaluate(
    (tags) => (window as unknown as { axe: { run: (ctx: Document, o: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: tags } }),
    WCAG_TAGS,
  );
  await testInfo.attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
  // Blocking: every WCAG A/AA violation fails the page, on every viewport and state.
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(' ')) }));
  expect(summary, `axe violations on ${name}`).toEqual([]);
}

type Check = 'visual' | 'a11y';

/** One (page, state) pair: every test gets its own browser context, so states never leak into each other. */
export const checkCases = (pages: ThemePage[]) =>
  pages.flatMap((p) => [
    { name: p.id, page: p, state: undefined as ThemeState | undefined },
    ...p.states.map((state) => ({ name: `${p.id}--${state.id}`, page: p, state })),
  ]);

/** Visit the page, open the state (if any) and run `check`. Skips states absent at this viewport. */
export async function runThemeCheck(page: Page, c: ReturnType<typeof checkCases>[number], check: Check, testInfo: TestInfo) {
  await visit(page, c.page.path);
  if (c.state && !(await c.state.open(page))) {
    testInfo.skip(true, `${c.state.id} does not exist at this viewport`);
    return;
  }
  if (check === 'visual') await screenshot(page, c.name, c.page.mask);
  else await audit(page, c.name, testInfo);
}
