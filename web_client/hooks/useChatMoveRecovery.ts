import { useEffect, useRef, useState } from 'react';
import { isChatMovedError } from '@/lib/chat/chat-moved';

/** What `sendMessage` was called with: enough to send the same turn again. */
export interface SentTurn {
    content: string;
    attachments?: string[];
    data?: Record<string, unknown>;
}

interface UseChatMoveRecoveryOptions {
    /** The AI SDK error of the last turn. */
    error: Error | undefined;
    sessionId: string | null;
    /** The history of `sessionId` is in the chat's messages: the turn goes after it
     *  (sent before, the first history sync would replace it). */
    historyReady: boolean;
    /** Only a signed-in user has a chat of their own to move to. */
    enabled: boolean;
    refreshUserChat: () => Promise<string | null>;
    /** Send a text-only turn again. */
    resend: (turn: SentTurn) => void;
    /** Give a turn with photos or videos back to the user: they were uploaded
     *  under the old chat, which the backend does not take for the new one. */
    restore: (turn: SentTurn) => void;
    lastTurn: () => SentTurn | null;
}

const MEDIA_FIELDS = ['mediaUrls', 'imageUrls', 'videoFileUris'] as const;

function hasMedia({ attachments, data }: SentTurn): boolean {
    if (attachments?.length) return true;
    return MEDIA_FIELDS.some((field) => {
        const value = data?.[field];
        return Array.isArray(value) && value.length > 0;
    });
}

/** The turn's room belonged to the old chat: the new chat's active room is used. */
function withoutRoom({ data, ...turn }: SentTurn): SentTurn {
    if (!data) return turn;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
    const { roomId, ...rest } = data;
    return { ...turn, data: rest };
}

/**
 * A turn refused because the chat is no longer the user's (Phase 139: merged
 * into their chat, or a stale id in an old tab): ask the backend for the user's
 * chat, open it and send the same turn there, once — or, when it had photos or
 * videos, give it back to the user to attach them again. The refusal stays
 * hidden meanwhile; it shows when the backend has no other chat to give.
 */
export function useChatMoveRecovery({
    error,
    sessionId,
    historyReady,
    enabled,
    refreshUserChat,
    resend,
    restore,
    lastTurn,
}: UseChatMoveRecoveryOptions): { visibleError: Error | undefined } {
    const handledRef = useRef<Error | null>(null);
    const pendingRef = useRef<{ from: string; turn: SentTurn | null } | null>(null);
    const [failedError, setFailedError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled || !error || !sessionId || handledRef.current === error || !isChatMovedError(error)) return;
        handledRef.current = error;
        const from = sessionId;
        pendingRef.current = { from, turn: lastTurn() };
        const giveUp = () => {
            pendingRef.current = null;
            setFailedError(error);
        };
        refreshUserChat().then((chatId) => {
            if (chatId === null || chatId === from) giveUp();
        }, giveUp);
    }, [enabled, error, sessionId, refreshUserChat, lastTurn]);

    useEffect(() => {
        const pending = pendingRef.current;
        if (!pending || !sessionId || sessionId === pending.from || !historyReady) return;
        pendingRef.current = null;
        if (!pending.turn) return;
        if (hasMedia(pending.turn)) restore(pending.turn);
        else resend(withoutRoom(pending.turn));
    }, [sessionId, historyReady, resend, restore]);

    const hidden = enabled && isChatMovedError(error) && failedError !== error;
    return { visibleError: hidden ? undefined : error };
}
