/**
 * The only hand-written inputs of the theme harness: what the file system and
 * the sitemap cannot know. Everything else in THEME_PAGES is derived.
 */

/** Route prefixes that need a signed-in user, and which kind. */
export const AUTH_PREFIXES: Record<string, 'user' | 'admin'> = {
  '/dashboard': 'user',
  '/admin': 'admin',
};

/** Sample values for dynamic segments not resolvable from the sitemap. */
export const SAMPLE_PARAMS: Record<string, string> = {
  projectId: 'proj-e2e',
};

/** Pages with no page.tsx of their own (rendered by Next for any unknown URL). */
export const EXTRA_PATHS: readonly { id: string; path: string }[] = [{ id: 'not-found', path: '/theme-check-not-found' }];

/** Elements whose content changes between runs: masked in screenshots. */
export const DYNAMIC_MASKS: readonly string[] = ['time', '[data-dynamic]', '[aria-live]'];

/**
 * Timed UI that appears on its own a few seconds after load: wait for its final
 * text so every screenshot shows it in the same state (it is themed UI too, so
 * it is waited for, not masked). Pages where it never appears just time out quietly.
 */
export const SETTLE_TEXTS: readonly { text: string; timeoutMs: number }[] = [
  { text: 'Ciao, sono qui per aiutarti a ristrutturare la tua casa!', timeoutMs: 6_000 },
];
