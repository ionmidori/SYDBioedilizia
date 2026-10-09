/**
 * Best-effort pre-warm of the Cloud Run backend.
 *
 * The backend scales to zero when idle, and a cold instance needs several
 * seconds to start. A cheap public `/health` request makes Cloud Run start an
 * instance while the user is still reading or typing, so their first chat
 * message does not pay the cold start.
 *
 * Called on page load and every time the chat opens; throttled so a burst of
 * calls sends at most one request per interval. The request is never aborted
 * on unmount: once it has left, Cloud Run starts the instance regardless.
 */
const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';
const MIN_INTERVAL_MS = 4 * 60 * 1000; // below Cloud Run's idle scale-down window
const TIMEOUT_MS = 10_000;

let lastWarmupAt = 0;

export function warmBackend(): void {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    if (now - lastWarmupAt < MIN_INTERVAL_MS) return;
    lastWarmupAt = now;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    fetch(`${API_ROOT}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
    })
        .catch(() => {
            // Best-effort: a failed warm-up only means the first message may be slower.
        })
        .finally(() => clearTimeout(timer));
}

/** Test helper: forget the last warm-up time. */
export function resetBackendWarmupForTests(): void {
    lastWarmupAt = 0;
}
