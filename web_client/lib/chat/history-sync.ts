import type { ChatStatus, UIMessage as Message } from 'ai';
import { getMessageText } from './messages';

/**
 * Reconciliation between the Firestore history and the AI SDK `useChat` state.
 *
 * This module is deliberately pure — no React, no Firebase, no timers — so the
 * most bug-prone logic in the chat stack can be exercised with plain
 * input/output assertions. The caller ({@link useChatSync}/ChatProvider) owns
 * the refs, the `setMessages` call and the `setTimeout(…, 0)` deferral.
 */

/** Why a decision was taken. Mirrors the historical `[ChatProvider]` traces. */
export type SyncReason =
    | 'stale-session'
    | 'history-not-loaded'
    | 'streaming'
    | 'cold-start'
    | 'welcome-only'
    | 'in-sync'
    | 'awaiting-snapshot'
    | 'first-sync'
    | 'adopt-ids'
    | 'length-mismatch';

export type SyncDecision =
    | { kind: 'noop'; reason: SyncReason }
    | { kind: 'set'; messages: Message[]; reason: SyncReason };

export interface HistorySyncInput {
    /** Current `useChat` messages. */
    sdkMessages: readonly Message[];
    /** Target state: welcome message + converted Firestore history. */
    fullHistory: Message[];
    /** Length of the raw Firestore history, i.e. WITHOUT the welcome message. */
    historyLength: number;
    status: ChatStatus;
    historyLoaded: boolean;
    /** `loadedForSessionId === sessionId` — false while a session switch is in flight. */
    sessionMatches: boolean;
    isFirstSync: boolean;
    welcomeInjected: boolean;
}

/**
 * Decide whether the SDK message state must be replaced with the history.
 *
 * The guard order is load-bearing and must not be reordered — see the inline
 * notes for the race conditions each one protects against.
 */
export function planHistorySync(input: HistorySyncInput): SyncDecision {
    const {
        sdkMessages,
        fullHistory,
        historyLength,
        status,
        historyLoaded,
        sessionMatches,
        isFirstSync,
        welcomeInjected,
    } = input;

    // STALE DATA GUARD: historyMessages is only valid once loadedForSessionId matches
    // the current sessionId. During a session transition, the Firestore snapshot for the
    // new session hasn't fired yet, so historyMessages still holds data from the previous
    // session. Syncing it would re-populate the chat with old messages.
    if (!sessionMatches) {
        return { kind: 'noop', reason: 'stale-session' };
    }

    // RACE CONDITION GUARD: Status 'ready' means useChat just finished a request.
    // In local dev, there might be a lag between saving to Firestore and onSnapshot firing.
    // We don't want to revert to an empty history while waiting for that snapshot.
    const isRecentlyFinished = status === 'ready' && sdkMessages.length > 0;

    if (!historyLoaded) {
        return { kind: 'noop', reason: 'history-not-loaded' };
    }
    if (status === 'streaming' || status === 'submitted') {
        return { kind: 'noop', reason: 'streaming' };
    }

    // 1. Cold Start (Welcome Message)
    if (historyLength === 0 && sdkMessages.length === 0 && !welcomeInjected) {
        return { kind: 'set', messages: fullHistory, reason: 'cold-start' };
    }

    // Skip sync if we injected the welcome message and history is empty
    if (welcomeInjected && historyLength === 0) {
        return { kind: 'noop', reason: 'welcome-only' };
    }

    // 2. Synchronization Logic
    const sdkLen = sdkMessages.length;
    const histLen = fullHistory.length;
    const needsSync =
        sdkLen !== histLen ||
        (sdkLen > 0 && histLen > 0 && sdkMessages[sdkLen - 1].id !== fullHistory[histLen - 1].id);

    if (!needsSync) {
        return { kind: 'noop', reason: 'in-sync' };
    }

    // RACE CONDITION GUARD: Must run BEFORE first-sync to prevent
    // overwriting SDK optimistic messages when Firestore is behind.
    // Background task saves user message AFTER streaming completes,
    // so Firestore may temporarily have fewer messages than the SDK.
    if (isRecentlyFinished && histLen < sdkLen) {
        return { kind: 'noop', reason: 'awaiting-snapshot' };
    }

    if (isFirstSync) {
        return { kind: 'set', messages: fullHistory, reason: 'first-sync' };
    }

    // Optimization: If lengths are equal and the last message content is identical,
    // just adopt the Firestore IDs without a full state rebuild.
    if (sdkLen === histLen && sdkLen > 0) {
        const sdkContent = getMessageText(sdkMessages[sdkLen - 1]);
        const histContent = getMessageText(fullHistory[histLen - 1]);
        if (sdkContent === histContent) {
            return { kind: 'set', messages: fullHistory, reason: 'adopt-ids' };
        }
    }

    // If history is longer, it's definitive (another device or backend update)
    return { kind: 'set', messages: fullHistory, reason: 'length-mismatch' };
}
