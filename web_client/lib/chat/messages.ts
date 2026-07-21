import type { UIMessage as Message } from 'ai';
import type { Message as FirestoreMessage } from '@/types/chat';

/**
 * Chat message helpers shared by the provider and the history-sync planner.
 *
 * Pure module: no React, no Firebase, no side effects — so the reconciliation
 * logic that depends on it stays unit-testable in isolation.
 */

export const WELCOME_MESSAGE = {
    id: 'welcome-msg',
    role: 'assistant',
    parts: [{ type: 'text', text: "✨ **Ciao! Sono Syd**, il tuo assistente per la ristrutturazione. ✨\n\nEcco cosa posso fare per aiutarti a realizzare il tuo progetto:\n\n\n📋 **1. Creare preventivo veloce:**\n_Ottieni subito una stima dei costi._\n\n\n🎨 **2. Creare un rendering gratuito:**\n_Visualizza in anteprima le tue idee._\n\n\n💡 **3. Fornire informazioni dettagliate:**\n_Chiedi consigli su materiali e design._\n\n\n👇 **Come posso aiutarti oggi?**" }],
    createdAt: new Date()
} as unknown as Message;

/**
 * Row shape accepted by {@link historyToUIMessage} — structurally satisfied by
 * both `FirestoreMessage` and raw Firestore documents.
 */
export interface HistoryRow {
    id?: string;
    role?: string;
    content?: unknown;
    attachments?: { images?: string[] } | undefined;
}

/**
 * Convert a Firestore history row into a valid AI SDK v7 UIMessage.
 *
 * Firestore history comes back content-only (no `parts`). AI SDK v7 requires
 * every message in `useChat` state to carry a `parts` array: loading
 * content-only messages corrupts the streaming reconciliation so a
 * freshly-streamed assistant reply is NEVER appended to state — it only shows
 * after a full page refresh (which re-renders from history without streaming).
 * Empty/new sessions are unaffected because nothing malformed is loaded.
 */
export function historyToUIMessage(m: HistoryRow): Message {
    const text = typeof m.content === 'string' ? m.content : '';
    const parts: Array<{ type: string; text?: string; mediaType?: string; url?: string }> = [];
    if (text) parts.push({ type: 'text', text });
    for (const url of m.attachments?.images ?? []) {
        if (typeof url === 'string') parts.push({ type: 'file', mediaType: 'image/jpeg', url });
    }
    // v7 messages must have at least one part; an empty assistant renders as "thinking".
    if (parts.length === 0) parts.push({ type: 'text', text: '' });
    return { id: m.id, role: m.role, parts } as unknown as Message;
}

/**
 * Read the textual content of a message regardless of its shape.
 *
 * v7 messages carry `parts`, while legacy/Firestore-derived rows may still
 * carry a flat `content` string. Replaces the `as any` casts previously spread
 * across ChatProvider. A message whose first part has no text (e.g. a file-only
 * user message) yields `''`, matching the previous `|| ''` behaviour.
 */
export function getMessageText(message: Message | null | undefined): string {
    if (!message) return '';
    const m = message as unknown as {
        content?: unknown;
        parts?: ReadonlyArray<{ text?: unknown } | undefined>;
    };
    if (typeof m.content === 'string') return m.content;
    const firstPartText = m.parts?.[0]?.text;
    return typeof firstPartText === 'string' ? firstPartText : '';
}

/**
 * Build the message list the SDK state should converge to: the welcome message
 * followed by the Firestore history.
 *
 * Standalone `tool` rows are not v7 messages (tool data lives inside the
 * assistant message) — they are excluded, and every remaining row is converted
 * to a valid v7 UIMessage with `parts` so streaming reconciliation works.
 */
export function buildFullHistory(historyMessages: readonly FirestoreMessage[]): Message[] {
    return [
        WELCOME_MESSAGE,
        ...historyMessages
            .filter((m) => m.role !== 'tool')
            .map((m) => historyToUIMessage(m)),
    ];
}
