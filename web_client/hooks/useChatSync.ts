import { useEffect, useRef } from 'react';
import type { ChatStatus, UIMessage as Message } from 'ai';
import type { Message as FirestoreMessage } from '@/types/chat';
import { planHistorySync } from '@/lib/chat/history-sync';
import { buildFullHistory } from '@/lib/chat/messages';
import { logger } from '@/lib/logger';

interface UseChatSyncOptions {
    /** Current `useChat` messages. */
    messages: Message[];
    /** `useChat().setMessages` — the only writer of SDK state this hook touches. */
    setMessages: (messages: Message[]) => void;
    /** Raw Firestore history for the current session. */
    historyMessages: FirestoreMessage[];
    historyLoaded: boolean;
    /** Session the history was actually loaded for (see useChatHistory). */
    loadedForSessionId: string | undefined;
    sessionId: string | null;
    status: ChatStatus;
    /** Monotonic counter bumped after a chat clear to allow shrinking SDK state once. */
    clearGeneration?: number;
}

/**
 * Keep the AI SDK message state in sync with the Firestore history.
 *
 * The decision lives in the pure `planHistorySync` (lib/chat/history-sync.ts),
 * where every guard and race condition is unit-tested. This hook only owns the
 * per-session refs and applies the decision: the `setTimeout(…, 0)` defers
 * `setMessages` out of the effect commit.
 */
export function useChatSync({
    messages,
    setMessages,
    historyMessages,
    historyLoaded,
    loadedForSessionId,
    sessionId,
    status,
    clearGeneration,
}: UseChatSyncOptions): void {
    const welcomeInjectedRef = useRef(false);
    const isFirstSyncRef = useRef(true);
    const allowShrinkRef = useRef(false);
    const lastClearGenRef = useRef(clearGeneration ?? 0);
    const staleHistoryAtClearRef = useRef<readonly FirestoreMessage[] | null>(null);

    // Reset per-session refs when sessionId changes.
    useEffect(() => {
        welcomeInjectedRef.current = false;
        isFirstSyncRef.current = true;
        allowShrinkRef.current = false;
        staleHistoryAtClearRef.current = null;
    }, [sessionId]);

    useEffect(() => {
        if (clearGeneration !== undefined && clearGeneration !== lastClearGenRef.current) {
            lastClearGenRef.current = clearGeneration;
            allowShrinkRef.current = true;
            staleHistoryAtClearRef.current = historyMessages;
        }

        // ALWAYS prepend the welcome message to the history so it persists.
        const fullHistory = buildFullHistory(historyMessages);

        // If an optimistic clear just shrunk SDK messages before Firestore's snapshot updated,
        // skip re-applying the stale pre-clear snapshot so deleted messages do not flicker back.
        if (
            allowShrinkRef.current &&
            staleHistoryAtClearRef.current !== null &&
            historyMessages === staleHistoryAtClearRef.current &&
            fullHistory.length > messages.length
        ) {
            return;
        }

        const decision = planHistorySync({
            sdkMessages: messages,
            fullHistory,
            historyLength: historyMessages.length,
            status,
            historyLoaded,
            sessionMatches: loadedForSessionId === sessionId,
            isFirstSync: isFirstSyncRef.current,
            welcomeInjected: welcomeInjectedRef.current,
            allowShrink: allowShrinkRef.current,
        });

        if (decision.kind === 'noop') {
            if (decision.reason === 'awaiting-snapshot') {
                logger.debug('[ChatProvider] Sync Guard: Waiting for history snapshot...');
            } else if (decision.reason === 'in-sync' || decision.reason === 'welcome-only') {
                allowShrinkRef.current = false;
                staleHistoryAtClearRef.current = null;
            }
            return;
        }

        switch (decision.reason) {
            case 'cold-start':
                logger.debug('[ChatProvider] Cold start: Injecting welcome message.');
                welcomeInjectedRef.current = true;
                break;
            case 'first-sync':
                logger.debug(`[ChatProvider] Initial history sync (${fullHistory.length} messages)`);
                isFirstSyncRef.current = false;
                break;
            default:
                logger.debug(`[ChatProvider] History Sync (Mismatch: SDK ${messages.length} vs Hist ${fullHistory.length})`);
        }

        const timerId = setTimeout(() => {
            allowShrinkRef.current = false;
            staleHistoryAtClearRef.current = null;
            setMessages(decision.messages);
        }, 0);
        return () => clearTimeout(timerId);
    }, [historyLoaded, historyMessages, loadedForSessionId, sessionId, setMessages, status, messages, clearGeneration]);
}
