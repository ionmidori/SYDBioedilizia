import { useEffect } from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';

interface UseCadIntentOptions {
    searchParams: ReadonlyURLSearchParams | null;
    historyLoaded: boolean;
    isLoading: boolean;
    messagesLength: number;
    sendMessage: (content: string, attachments?: string[], data?: Record<string, unknown>) => Promise<void>;
}

/**
 * Auto-triggers the CAD survey flow when the page is opened with
 * `?intent=cad` (e.g. from a "misura la stanza" CTA), then strips the
 * query param so a refresh doesn't retrigger it.
 *
 * Re-entry is gated by `!isLoading && messagesLength <= 2`, not by the URL
 * cleanup: `history.replaceState` doesn't notify the router, so `searchParams`
 * keeps reporting `intent=cad` for the rest of the mount. There is a narrow
 * window, after `sendMessage` resolves and before the assistant reply lands,
 * where the effect could re-run — pre-existing behavior, not introduced here.
 */
export function useCadIntent({
    searchParams,
    historyLoaded,
    isLoading,
    messagesLength,
    sendMessage,
}: UseCadIntentOptions): void {
    useEffect(() => {
        const intent = searchParams?.get('intent');
        if (intent === 'cad' && historyLoaded && !isLoading && messagesLength <= 2) {
            const timeoutId = setTimeout(async () => {
                try {
                    await sendMessage("Vorrei effettuare un rilievo CAD di questa stanza. Mi aiuti a estrarre le misure?");
                    // Cleanup URL
                    const params = new URLSearchParams(window.location.search);
                    params.delete('intent');
                    const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
                    window.history.replaceState({}, '', newUrl);
                } catch (err) {
                    console.error('Failed to trigger auto-msg', err);
                }
            }, 1000);
            return () => clearTimeout(timeoutId);
        }
    }, [searchParams, historyLoaded, isLoading, messagesLength, sendMessage]);
}
