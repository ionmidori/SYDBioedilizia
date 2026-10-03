// storage.rules against the Storage + Firestore emulators (security audit 2026-10-03, H2):
// project files, renders and chat attachments are readable only by the project owner,
// whose uid lives in Firestore at projects/{id}.userId.
//
// Run from the repo root (firebase.json there configures both emulators; emulators:exec
// exports their hosts, which initializeTestEnvironment picks up):
//   npx firebase-tools emulators:exec --only storage,firestore --project demo-syd-rules "npm --prefix tests/rules test"
// RULES=<path> points the same cases at another rules file (e.g. to show a regression).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject, listAll } from 'firebase/storage';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RULES = process.env.RULES ?? `${ROOT}storage.rules`;
const env = await initializeTestEnvironment({
  projectId: 'demo-syd-rules',
  storage: { rules: readFileSync(RULES, 'utf8') },
  firestore: { rules: readFileSync(`${ROOT}firestore.rules`, 'utf8') },
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMG = { contentType: 'image/png' };
const google = { firebase: { sign_in_provider: 'google.com' } };
const anon = { firebase: { sign_in_provider: 'anonymous' } };

// Seed: projects owned by "owner", plus files written with rules disabled.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'projects/p1'), { userId: 'owner' });
  const st = ctx.storage();
  for (const p of ['projects/p1/uploads/a.png', 'renders/p1/r.png', 'user-uploads/p1/u.png', 'renders/p2/r.png']) {
    await uploadBytes(ref(st, p), PNG, IMG);
  }
});

const owner = env.authenticatedContext('owner', google).storage();
const other = env.authenticatedContext('attacker', google).storage();
const anonOwner = env.authenticatedContext('owner', anon).storage();
const guest = env.unauthenticatedContext().storage();

const cases = [
  // projects/{id}/uploads
  ['owner reads own upload', true, () => getBytes(ref(owner, 'projects/p1/uploads/a.png'))],
  ['owner writes own upload', true, () => uploadBytes(ref(owner, 'projects/p1/uploads/b.png'), PNG, IMG)],
  ['owner deletes own upload', true, () => deleteObject(ref(owner, 'projects/p1/uploads/b.png'))],
  ['other reads upload', false, () => getBytes(ref(other, 'projects/p1/uploads/a.png'))],
  ['other overwrites upload', false, () => uploadBytes(ref(other, 'projects/p1/uploads/a.png'), PNG, IMG)],
  ['other deletes upload', false, () => deleteObject(ref(other, 'projects/p1/uploads/a.png'))],
  ['other lists uploads', false, () => listAll(ref(other, 'projects/p1/uploads'))],
  ['upload to missing project', false, () => uploadBytes(ref(owner, 'projects/nope/uploads/x.png'), PNG, IMG)],
  ['anonymous token reads upload', false, () => getBytes(ref(anonOwner, 'projects/p1/uploads/a.png'))],
  ['owner uploads wrong type', false, () => uploadBytes(ref(owner, 'projects/p1/uploads/x.exe'), PNG, { contentType: 'application/x-msdownload' })],
  // renders/{sessionId}
  ['owner reads own render', true, () => getBytes(ref(owner, 'renders/p1/r.png'))],
  ['owner lists own renders', true, () => listAll(ref(owner, 'renders/p1'))],
  ['other reads render', false, () => getBytes(ref(other, 'renders/p1/r.png'))],
  ['other lists renders root', false, () => listAll(ref(other, 'renders'))],
  ['owner lists renders root', false, () => listAll(ref(owner, 'renders'))],
  ['read render of missing project', false, () => getBytes(ref(owner, 'renders/p2/r.png'))],
  ['owner writes render', false, () => uploadBytes(ref(owner, 'renders/p1/new.png'), PNG, IMG)],
  // user-uploads/{sessionId}
  ['owner reads own chat attachment', true, () => getBytes(ref(owner, 'user-uploads/p1/u.png'))],
  ['other reads chat attachment', false, () => getBytes(ref(other, 'user-uploads/p1/u.png'))],
  // unchanged areas
  ['owner writes own avatar', true, () => uploadBytes(ref(owner, 'users/owner/avatar.webp'), PNG, IMG)],
  ['other writes avatar', false, () => uploadBytes(ref(other, 'users/owner/avatar.webp'), PNG, IMG)],
  ['signed-out reads upload', false, () => getBytes(ref(guest, 'projects/p1/uploads/a.png'))],
  ['default deny', false, () => getBytes(ref(owner, 'elsewhere/x.png'))],
];

let failed = 0;
for (const [name, allowed, op] of cases) {
  try {
    await (allowed ? assertSucceeds(op()) : assertFails(op()));
    console.log(`  ok    ${allowed ? 'ALLOW' : 'DENY '}  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  expected ${allowed ? 'ALLOW' : 'DENY '}  ${name}  (${e.code ?? e.message})`);
  }
}
await env.cleanup();
console.log(`\nstorage rules: ${cases.length - failed}/${cases.length} as expected`);
process.exit(failed ? 1 : 0);
