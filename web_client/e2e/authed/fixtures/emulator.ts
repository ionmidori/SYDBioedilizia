import {
  AUTH_EMULATOR_URL,
  EMULATOR_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  SEEDED_MESSAGES,
} from './constants';

/**
 * Emulator control + seeding over the emulators' REST APIs.
 *
 * Deliberately dependency-free (plain `fetch` from the Node test process)
 * rather than going through firebase-admin: no service-account shim, no extra
 * env plumbing, and nothing that could accidentally point at a real project.
 * The Firestore emulator accepts `Authorization: Bearer owner` as a
 * rules-bypassing admin token, which is what lets us seed `messages` even
 * though `firestore.rules` has `allow write: if false` there (writes are
 * backend-only in production).
 */

const FIRESTORE_DOCS_URL =
  `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${EMULATOR_PROJECT_ID}` +
  `/databases/(default)/documents`;

const ADMIN_HEADERS = {
  Authorization: 'Bearer owner',
  'Content-Type': 'application/json',
};

async function expectOk(res: Response, what: string): Promise<Response> {
  if (!res.ok) {
    throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

/** Wipes all emulator users and documents so every run starts identically. */
export async function resetEmulators(): Promise<void> {
  await expectOk(
    await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`, {
      method: 'DELETE',
    }),
    'auth emulator reset',
  );
  await expectOk(
    await fetch(
      `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}` +
        `/databases/(default)/documents`,
      { method: 'DELETE' },
    ),
    'firestore emulator reset',
  );
}

export interface TestUser {
  localId: string;
  idToken: string;
}

/** Creates the test user directly in the Auth emulator. */
export async function createTestUser(email: string, password: string): Promise<TestUser> {
  const res = await expectOk(
    await fetch(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    ),
    'auth emulator signUp',
  );
  return (await res.json()) as TestUser;
}

/**
 * Sets custom claims on an emulator user (e.g. `{ role: 'admin' }`), exactly
 * what `scripts/set_admin_claim.py` does in production. Must run BEFORE the
 * user signs in: claims are baked into the ID token when it is minted.
 */
export async function setCustomClaims(localId: string, claims: Record<string, unknown>): Promise<void> {
  await expectOk(
    await fetch(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${EMULATOR_PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ localId, customAttributes: JSON.stringify(claims) }),
      },
    ),
    'auth emulator set custom claims',
  );
}

export interface SeedMessage {
  id: string;
  role: string;
  content: string;
  ts: string;
}

/** Seeds the deterministic chat history used by the reload-persistence test. */
export async function seedChatHistory(uid: string): Promise<string> {
  const sessionId = `global-${uid}`;
  await seedSession(sessionId, uid, SEEDED_MESSAGES);
  return sessionId;
}

/**
 * Writes a session owned by `uid` with its messages, as the backend does
 * (Admin SDK: rules bypassed).
 */
export async function seedSession(
  sessionId: string,
  uid: string,
  messages: readonly SeedMessage[],
): Promise<void> {
  // Parent session doc: the rules read its owner (not for the `global-<uid>` path).
  await expectOk(
    await fetch(`${FIRESTORE_DOCS_URL}/sessions?documentId=${sessionId}`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        fields: {
          userId: { stringValue: uid },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    }),
    'seed session doc',
  );

  for (const message of messages) {
    await expectOk(
      await fetch(
        `${FIRESTORE_DOCS_URL}/sessions/${sessionId}/messages?documentId=${message.id}`,
        {
          method: 'POST',
          headers: ADMIN_HEADERS,
          body: JSON.stringify({
            fields: {
              role: { stringValue: message.role },
              content: { stringValue: message.content },
              timestamp: { timestampValue: message.ts },
            },
          }),
        },
      ),
      `seed message ${message.id}`,
    );
  }
}
