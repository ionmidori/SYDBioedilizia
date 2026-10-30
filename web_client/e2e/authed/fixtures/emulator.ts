import {
  AUTH_EMULATOR_URL,
  EMULATOR_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  SEEDED_MESSAGES,
  USER_CHAT_ID,
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
  /** Tools the assistant called in this message (saved as `tool_calls`, like the backend). */
  toolCalls?: readonly string[];
}

/** Seeds the user's chat with the deterministic history of the reload-persistence test. */
export async function seedChatHistory(uid: string): Promise<string> {
  await seedSession(USER_CHAT_ID, uid, SEEDED_MESSAGES);
  return USER_CHAT_ID;
}

/** Gives an existing session to `uid`, as the backend's guest claim does. */
export async function setSessionOwner(sessionId: string, uid: string): Promise<void> {
  await expectOk(
    await fetch(`${FIRESTORE_DOCS_URL}/sessions/${sessionId}?updateMask.fieldPaths=userId`, {
      method: 'PATCH',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ fields: { userId: { stringValue: uid } } }),
    }),
    'set session owner',
  );
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
  // Parent session doc: the rules read its owner.
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
  await seedMessages(sessionId, messages);
}

/** Adds messages to an existing session, as the backend saves a turn. */
export async function seedMessages(sessionId: string, messages: readonly SeedMessage[]): Promise<void> {
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
              ...(message.toolCalls && {
                tool_calls: {
                  arrayValue: {
                    values: message.toolCalls.map((name, n) => ({
                      mapValue: {
                        fields: { id: { stringValue: `${message.id}-call-${n}` }, name: { stringValue: name } },
                      },
                    })),
                  },
                },
              }),
            },
          }),
        },
      ),
      `seed message ${message.id}`,
    );
  }
}

export interface SeedRoom {
  id: string;
  label: string;
  type: string;
}

export interface SeedFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'render' | 'document';
  url: string;
  roomId: string | null;
}

/** Writes (creates or replaces) a document: a rerun after a failure seeds the same state. */
async function setDoc(path: string, id: string, fields: Record<string, unknown>, what: string): Promise<void> {
  await expectOk(
    await fetch(`${FIRESTORE_DOCS_URL}/${path}/${id}`, {
      method: 'PATCH',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ fields }),
    }),
    what,
  );
}

/**
 * The projection of the user's chat with its rooms and files (Phase 139: the
 * dashboard is the house), as the backend writes them. The rules read a file
 * or a room only when the projection exists and belongs to the reader.
 */
export async function seedHouse(
  uid: string,
  rooms: readonly SeedRoom[],
  files: readonly SeedFile[],
): Promise<void> {
  const now = Date.now();
  await setDoc('projects', USER_CHAT_ID, {
    userId: { stringValue: uid },
    session_id: { stringValue: USER_CHAT_ID },
    title: { stringValue: 'Nuovo Progetto' },
  }, 'seed house');
  for (const [n, room] of rooms.entries()) {
    await setDoc(`projects/${USER_CHAT_ID}/rooms`, room.id, {
      room_id: { stringValue: room.id },
      label: { stringValue: room.label },
      room_type: { stringValue: room.type },
      created_at: { timestampValue: new Date(now + n).toISOString() },
    }, `seed room ${room.id}`);
  }
  for (const [n, file] of files.entries()) {
    await setDoc(`projects/${USER_CHAT_ID}/files`, file.id, {
      name: { stringValue: file.name },
      type: { stringValue: file.type },
      url: { stringValue: file.url },
      size: { integerValue: '2048' },
      uploadedBy: { stringValue: uid },
      uploadedAt: { timestampValue: new Date(now - n * 1000).toISOString() },
      roomId: file.roomId === null ? { nullValue: null } : { stringValue: file.roomId },
    }, `seed file ${file.id}`);
  }
}

/** Removes the projection of the user's chat and what {@link seedHouse} put under it. */
export async function clearHouse(rooms: readonly SeedRoom[], files: readonly SeedFile[]): Promise<void> {
  const paths = [
    ...rooms.map((room) => `projects/${USER_CHAT_ID}/rooms/${room.id}`),
    ...files.map((file) => `projects/${USER_CHAT_ID}/files/${file.id}`),
    `projects/${USER_CHAT_ID}`,
  ];
  for (const path of paths) {
    await expectOk(
      await fetch(`${FIRESTORE_DOCS_URL}/${path}`, { method: 'DELETE', headers: ADMIN_HEADERS }),
      `clear ${path}`,
    );
  }
}
