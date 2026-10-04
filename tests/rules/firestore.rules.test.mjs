// firestore.rules against the Firestore emulator (security audit 2026-10-03, M3/L6):
// projects are written only by the backend (Admin SDK), testimonials are served only
// through /api/content/testimonials. Run together with storage.rules.test.mjs (npm test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RULES = process.env.FIRESTORE_RULES ?? `${ROOT}firestore.rules`;
const env = await initializeTestEnvironment({
  projectId: 'demo-syd-rules',
  firestore: { rules: readFileSync(RULES, 'utf8') },
});

const google = { firebase: { sign_in_provider: 'google.com' } };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'projects/p1'), { userId: 'owner', status: 'draft' });
  await setDoc(doc(db, 'testimonials/t1'), { userId: 'owner', text: 'Ottimo', rating: 5, status: 'approved' });
});

const owner = env.authenticatedContext('owner', google).firestore();
const other = env.authenticatedContext('attacker', google).firestore();
const guest = env.unauthenticatedContext().firestore();

const cases = [
  // projects/{id}: owner reads, nobody writes from the client
  ['owner reads own project', true, () => getDoc(doc(owner, 'projects/p1'))],
  ['owner lists own projects', true, () => getDocs(query(collection(owner, 'projects'), where('userId', '==', 'owner')))],
  ['other reads project', false, () => getDoc(doc(other, 'projects/p1'))],
  ['owner creates project', false, () => setDoc(doc(owner, 'projects/p2'), { userId: 'owner' })],
  ['owner updates status', false, () => updateDoc(doc(owner, 'projects/p1'), { status: 'approved' })],
  ['owner deletes project', false, () => deleteDoc(doc(owner, 'projects/p1'))],
  // testimonials/{id}: backend only
  ['signed-out reads approved testimonial', false, () => getDoc(doc(guest, 'testimonials/t1'))],
  ['user lists testimonials', false, () => getDocs(collection(other, 'testimonials'))],
  ['user creates testimonial', false, () => setDoc(doc(owner, 'testimonials/t2'), { userId: 'owner', text: 'x', rating: 5, status: 'pending' })],
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
console.log(`\nfirestore rules: ${cases.length - failed}/${cases.length} as expected`);
process.exit(failed ? 1 : 0);
