import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Authenticated E2E config — runs against the Firebase Emulator Suite.
 *
 * Deliberately a SEPARATE config from `playwright.config.ts` rather than extra
 * projects inside it. Playwright has no per-project `webServer`, and this suite
 * needs a different build served on a different port: `NEXT_PUBLIC_*` values are
 * inlined at build time, so emulator mode cannot be toggled on the smoke
 * suite's artifact. Folding them together would boot both servers for every
 * run, slowing down the public merge gate for no benefit.
 *
 * Run it via `npm run test:e2e:auth`, wrapped in `firebase emulators:exec`
 * (see the repo-root README / the `authed` CI job) so the Auth and Firestore
 * emulators are up. Requires `npm run build:e2e` first.
 */

const PORT = 3100; // != 3000 so the smoke suite can run concurrently
const BASE_URL = `http://127.0.0.1:${PORT}`;

export const AUTH_STATE_FILE = path.join(__dirname, 'e2e/authed/.auth/user.json');

/**
 * Must match `build:e2e` in package.json — `next start` reads some of these at
 * runtime, and NEXT_DIST_DIR must point at the artifact that build produced.
 */
const EMULATOR_ENV = {
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-syd-e2e',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-syd-e2e.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-syd-e2e.appspot.com',
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'ci-placeholder-recaptcha',
  NEXT_PUBLIC_ENABLE_APP_CHECK: 'false',
};

export default defineConfig({
  testDir: './e2e/authed',

  // One emulator instance, one seeded user, one seeded session — the setup
  // project wipes both. Parallelism would need per-worker uids and session
  // namespaces; determinism is worth more than the few seconds saved.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-authed' }]]
    : 'list',

  // Emulator round-trips are slower than the static smoke routes.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // >= xl so the desktop navigation renders (SignInButton is `hidden xl:flex`).
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    // A setup *project* rather than `globalSetup`: it gets a real `page`, a
    // trace on failure and a row in the HTML report. "Login broke" is the most
    // likely failure mode here, so it needs to be debuggable.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'authed',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE_FILE },
    },
  ],

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { ...EMULATOR_ENV, PORT: String(PORT) },
  },
});
