import { expect, type Page } from '@playwright/test';
import sitemap from '../../app/sitemap';
import { AUTH_PREFIXES, DYNAMIC_MASKS, EXTRA_PATHS, SAMPLE_PARAMS } from './extra-pages';
import { settle } from './settle';
import { fillTemplate, matchesTemplate, routeTemplates } from './routes';
import { STATES, type ThemeState } from './states';

/**
 * Every page the theme harness screenshots and audits, one URL per route
 * template. Derived, not listed: templates from app/**\/page.tsx, concrete
 * values of dynamic public segments from the sitemap, the rest from
 * extra-pages.ts. A template that resolves to no URL is reported by
 * pages.spec.ts.
 */
export interface ThemePage {
  id: string;
  path: string;
  template: string;
  auth?: 'user' | 'admin';
  states: ThemeState[];
  mask: readonly string[];
}

const pathnames = sitemap().map((entry) => new URL(entry.url).pathname);

function authOf(template: string): ThemePage['auth'] {
  const prefix = Object.keys(AUTH_PREFIXES).find((p) => template === p || template.startsWith(`${p}/`));
  return prefix ? AUTH_PREFIXES[prefix] : undefined;
}

function resolve(template: string): string | null {
  return pathnames.find((p) => matchesTemplate(p, template)) ?? fillTemplate(template, SAMPLE_PARAMS);
}

const idOf = (template: string) => (template === '/' ? 'home' : template.slice(1).replace(/[/[\]]+/g, '-').replace(/-$/, ''));

export const TEMPLATES = routeTemplates();

export const UNRESOLVED_TEMPLATES = TEMPLATES.filter((t) => resolve(t) === null);

export const THEME_PAGES: ThemePage[] = [
  ...TEMPLATES.flatMap((template) => {
    const path = resolve(template);
    if (path === null) return [];
    const auth = authOf(template);
    return [{ id: idOf(template), path, template, auth, states: STATES.filter((s) => s.appliesTo(template, auth)), mask: DYNAMIC_MASKS }];
  }),
  ...EXTRA_PATHS.map(({ id, path }) => ({ id, path, template: path, states: [], mask: DYNAMIC_MASKS })),
];

export const publicPages = () => THEME_PAGES.filter((p) => !p.auth);
export const authedPages = () => THEME_PAGES.filter((p) => p.auth);

/** Consent cookie set before every visit, so the consent banner is a state, not noise. */
export const consentCookie = (origin: string) => ({
  name: 'syd_cookie_consent',
  value: encodeURIComponent(JSON.stringify({ essential: true, analytics: false, marketing: false })),
  url: origin,
});

/** Navigate and wait until the page is visually settled. */
export async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load' });
  // Auto-advancing carousels stop under reduced motion: the config must emulate it, or screenshots drift.
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced motion emulated').toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}
