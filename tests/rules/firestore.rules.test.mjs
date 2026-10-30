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
  // Phase 128: quote dossier data is backend-only (Admin SDK), even for the owner.
  await setDoc(doc(db, 'projects/p1/private_data/quote'), { user_id: 'owner', status: 'draft', quote_number: 'PRV-2026-0001' });
  await setDoc(doc(db, 'projects/p1/private_data/quote/revisions/1'), { version: 1, actor_kind: 'ai' });
  await setDoc(doc(db, 'projects/p1/private_data/quote/deliveries/d1'), { to: 'owner@example.it' });
  await setDoc(doc(db, 'counters/quote_2026'), { next: 2 });
  await setDoc(doc(db, 'email_outbox/o1'), { kind: 'quote_delivery', status: 'pending' });
  await setDoc(doc(db, 'app_config/price_book'), { version: 1, items: [] });
  await setDoc(doc(db, 'app_config/price_book/history/1'), { version: 1 });
  await setDoc(doc(db, 'email_messages/m1'), { project_id: 'p1', delivery_id: 'd1' });
  await setDoc(doc(db, 'projects/p1/rooms/bagno'), { room_id: 'bagno', label: 'Bagno', room_type: 'bagno' });
  await setDoc(doc(db, 'guest_claim_tickets/h1'), { anonUid: 'anon-1', expiresAt: new Date(Date.now() + 600_000) });
  // Phase 139: one permanent chat per user, pointed at by users/{uid}.chat_id (backend-only).
  await setDoc(doc(db, 'sessions/chat-old'), { userId: 'owner', createdAt: new Date(Date.now() - 30 * 86_400_000) });
  await setDoc(doc(db, 'users/owner'), { displayName: 'Mario', chat_id: 'chat-old' });
  await setDoc(doc(db, 'sessions/chat-old/messages/m1'), { role: 'user', content: 'ciao' });
  // Legacy client-picked ids, without a parent session: no longer readable.
  await setDoc(doc(db, 'sessions/global-owner/messages/m1'), { role: 'user', content: 'vecchio' });
  await setDoc(doc(db, 'sessions/guest-owner/messages/m1'), { role: 'user', content: 'vecchio' });
});

const owner = env.authenticatedContext('owner', google).firestore();
const other = env.authenticatedContext('attacker', google).firestore();
const guest = env.unauthenticatedContext().firestore();
const anon = env.authenticatedContext('anon-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

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
  // quote dossier (Phase 128): drafts, revisions, deliveries and the number counter
  // are read and written only by the backend — prices stay confidential until approval
  ['owner reads own quote draft', false, () => getDoc(doc(owner, 'projects/p1/private_data/quote'))],
  ['owner edits own quote', false, () => updateDoc(doc(owner, 'projects/p1/private_data/quote'), { status: 'approved' })],
  ['owner reads quote revision', false, () => getDoc(doc(owner, 'projects/p1/private_data/quote/revisions/1'))],
  ['owner lists quote deliveries', false, () => getDocs(collection(owner, 'projects/p1/private_data/quote/deliveries'))],
  ['user reads number counter', false, () => getDoc(doc(owner, 'counters/quote_2026'))],
  ['user bumps number counter', false, () => setDoc(doc(owner, 'counters/quote_2026'), { next: 1 })],
  // email outbox (Phase 128 Fase 4): backend-only, never readable or writable by clients
  ['user reads email outbox', false, () => getDoc(doc(owner, 'email_outbox/o1'))],
  ['user reads the price book', false, () => getDoc(doc(owner, 'app_config/price_book'))],
  ['user edits the price book', false, () => setDoc(doc(owner, 'app_config/price_book'), { version: 2, items: [] })],
  ['user reads the price book history', false, () => getDoc(doc(owner, 'app_config/price_book/history/1'))],
  ['user enqueues an email', false, () => setDoc(doc(owner, 'email_outbox/o2'), { kind: 'admin_notification' })],
  ['user reads message index', false, () => getDoc(doc(owner, 'email_messages/m1'))],
  // rooms (Phase 138): the owner reads them (room chips), only the backend writes
  ['owner reads a room', true, () => getDoc(doc(owner, 'projects/p1/rooms/bagno'))],
  ['owner lists rooms', true, () => getDocs(collection(owner, 'projects/p1/rooms'))],
  ['other reads a room', false, () => getDoc(doc(other, 'projects/p1/rooms/bagno'))],
  ['signed-out lists rooms', false, () => getDocs(collection(guest, 'projects/p1/rooms'))],
  ['owner creates a room', false, () => setDoc(doc(owner, 'projects/p1/rooms/cucina'), { label: 'Cucina' })],
  ['owner renames a room', false, () => updateDoc(doc(owner, 'projects/p1/rooms/bagno'), { label: 'X' })],
  ['owner reads a room of a missing project', false, () => getDoc(doc(owner, 'projects/p9/rooms/bagno'))],
  // guest claim tickets (Phase 138 PR-6): backend only, not even the ticket's own guest
  ['guest reads its claim ticket', false, () => getDoc(doc(anon, 'guest_claim_tickets/h1'))],
  ['user lists claim tickets', false, () => getDocs(collection(owner, 'guest_claim_tickets'))],
  ['guest forges a claim ticket', false, () => setDoc(doc(anon, 'guest_claim_tickets/h2'), { anonUid: 'victim' })],
  ['user redeems a ticket from the client', false, () => updateDoc(doc(owner, 'guest_claim_tickets/h1'), { claimedBy: 'owner' })],
  // the user's chat (Phase 139): permanent, so readable whatever its age; the
  // pointer to it is decided by the backend only
  ['owner reads a 30-day-old chat', true, () => getDoc(doc(owner, 'sessions/chat-old'))],
  ['other reads the chat', false, () => getDoc(doc(other, 'sessions/chat-old'))],
  ['owner reads own user doc', true, () => getDoc(doc(owner, 'users/owner'))],
  ['owner updates its display name', true, () => updateDoc(doc(owner, 'users/owner'), { displayName: 'Mario R.' })],
  ['owner points its chat elsewhere', false, () => updateDoc(doc(owner, 'users/owner'), { chat_id: 'chat-x' })],
  ['owner stamps the chat assignment', false, () => updateDoc(doc(owner, 'users/owner'), { chat_assigned_at: new Date() })],
  ['new user creates its doc with a chat', false, () => setDoc(doc(other, 'users/attacker'), { chat_id: 'chat-old' })],
  ['new user creates its doc', true, () => setDoc(doc(other, 'users/attacker'), { displayName: 'Eve' })],
  // chat messages: only through a parent session the user owns (no more
  // global-<uid> / guest-<uid> ids picked by the client)
  ['owner reads its chat messages', true, () => getDocs(collection(owner, 'sessions/chat-old/messages'))],
  ['other reads the chat messages', false, () => getDocs(collection(other, 'sessions/chat-old/messages'))],
  ['owner reads legacy global-<uid> messages', false, () => getDocs(collection(owner, 'sessions/global-owner/messages'))],
  ['owner reads legacy guest-<uid> messages', false, () => getDocs(collection(owner, 'sessions/guest-owner/messages'))],
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
