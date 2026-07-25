import path from 'node:path';

/** Must match `firebase.json` -> emulators, and lib/firebase.ts. */
export const EMULATOR_PROJECT_ID = 'demo-syd-e2e';
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

/**
 * The `demo-` project prefix keeps the emulator suite fully offline: no
 * credentials are resolved and nothing can reach the real `chatbotluca-a8a73`
 * project by accident.
 */
export const TEST_USER = {
  email: 'e2e@syd.test',
  // Must satisfy lib/validation/auth-schema.ts: >=8 chars, uppercase, digit
  // and a special character. The form blocks submit client-side otherwise, so
  // a weaker password never even reaches the Auth emulator.
  password: 'E2ePassw0rd!',
} as const;

export const AUTH_DIR = path.join(__dirname, '..', '.auth');
export const AUTH_STATE_FILE = path.join(AUTH_DIR, 'user.json');
/** The seeded uid, handed from the setup project to the specs. */
export const UID_FILE = path.join(AUTH_DIR, 'uid.txt');

/**
 * Deterministic chat history for the reload-persistence test.
 *
 * Seeded under `sessions/global-<uid>/messages/*` because that is the session
 * id `useChatSession` derives for a signed-in, non-anonymous user with no
 * active project — and `firestore.rules` permits reading it when
 * `sessionId == 'global-' + request.auth.uid`. Seeding this path therefore
 * exercises the real production rules rather than a permissive test ruleset.
 */
export const SEEDED_MESSAGES = [
  { id: 'seed-1', role: 'user', content: 'Vorrei ristrutturare il bagno', ts: '2026-01-01T10:00:00Z' },
  { id: 'seed-2', role: 'assistant', content: 'Certo, di che metratura si tratta?', ts: '2026-01-01T10:00:05Z' },
  { id: 'seed-3', role: 'user', content: 'Circa sei metri quadri', ts: '2026-01-01T10:01:00Z' },
] as const;

/**
 * Quote fixtures. These are served over HTTP (route-mocked), not seeded into
 * Firestore: the quotes page reads `/api/py/quote/user/{uid}` via TanStack
 * Query, never Firestore directly.
 *
 * Shape must satisfy `quoteListItemSchema` in `types/quote.ts` — `fetchValidated`
 * rejects anything else and the list renders its error branch instead.
 */
export const QUOTES_FIXTURE = [
  {
    project_id: 'proj-approved',
    project_name: 'Bagno Trastevere',
    status: 'approved',
    grand_total: 18500.5,
    item_count: 12,
    updated_at: '2026-02-10T09:00:00Z',
    pdf_available: true,
  },
  {
    project_id: 'proj-pending',
    project_name: 'Cucina Prati',
    status: 'pending_review',
    grand_total: 0,
    item_count: 7,
    updated_at: '2026-02-12T09:00:00Z',
    pdf_available: false,
  },
  // Filtered out client-side by QuoteListClient — its presence proves the filter.
  {
    project_id: 'proj-draft',
    project_name: 'Bozza',
    status: 'draft',
    grand_total: 0,
    item_count: 0,
    updated_at: '2026-02-13T09:00:00Z',
    pdf_available: false,
  },
];
