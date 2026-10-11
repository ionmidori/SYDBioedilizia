/**
 * "You have unsaved changes" guard for the admin console.
 *
 * Editors register themselves while they hold edits; the navigation asks
 * `confirmLeave()` before moving away. A closing tab or a reload is covered by
 * the browser's own `beforeunload` prompt (see `useUnsavedGuard`).
 */
const holders = new Set<string>();

export const LEAVE_MESSAGE = 'Hai modifiche non salvate: se esci andranno perse. Uscire comunque?';

export function setUnsaved(key: string, unsaved: boolean): void {
  if (unsaved) holders.add(key);
  else holders.delete(key);
}

export function hasUnsaved(): boolean {
  return holders.size > 0;
}

/** True when it is fine to navigate away (nothing unsaved, or the admin agreed). */
export function confirmLeave(): boolean {
  return !hasUnsaved() || window.confirm(LEAVE_MESSAGE);
}
