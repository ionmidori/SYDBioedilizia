import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke-only Playwright config. It builds nothing itself — CI runs `next build`
 * first, then Playwright boots `next start` via the webServer block below and
 * asserts the app renders. Kept intentionally minimal (one browser, critical
 * public routes) so it stays fast and non-flaky as a merge gate.
 */

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Placeholder public config so Firebase/App Check client init does not throw.
// No live secrets; App Check disabled to avoid reCAPTCHA network calls.
const CI_PUBLIC_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'ci-placeholder-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ci-placeholder.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ci-placeholder',
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'ci-placeholder-recaptcha',
  NEXT_PUBLIC_ENABLE_APP_CHECK: 'false',
};

export default defineConfig({
  testDir: './e2e',
  // The authenticated suite lives in e2e/authed and needs the Firebase
  // emulators plus its own build — it runs from playwright.emulator.config.ts.
  // Without this it would be collected here and fail against the public build.
  testIgnore: '**/authed/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Theme harness screenshots (e2e/theme): local before/after baselines only,
  // never committed (font rendering differs between OSes) and never run in CI.
  snapshotPathTemplate: 'e2e/.visual-baseline/{projectName}/{arg}{ext}',
  grepInvert: process.env.CI ? /@visual/ : undefined,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      // The theme harness has its own projects below, at its own viewports.
      testIgnore: ['**/authed/**', '**/theme/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Theme harness, desktop: >= xl so the desktop navigation renders.
      name: 'desktop',
      testMatch: /theme\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Theme harness, phone.
      name: 'mobile',
      testMatch: /theme\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { ...CI_PUBLIC_ENV, PORT: String(PORT) },
  },
});
