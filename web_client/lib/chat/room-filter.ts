import type { UIMessage } from 'ai';
import type { Message } from '@/types/chat';

/** `'all'` shows every message in the project; any other string filters to that `room_id`. */
export type RoomViewFilter = 'all' | string;

export interface FilterMessagesOptions {
    filter: RoomViewFilter;
    historyById: ReadonlyMap<string, Message>;
    optimisticRoomById?: ReadonlyMap<string, string>;
    isLoading?: boolean;
    inFlightRoomId?: string | null;
}

const WELCOME_MSG_ID = 'welcome-msg';

/**
 * Resolve which room a message belongs to.
 * Firestore `historyById` is the source of truth; `optimisticRoomById` covers
 * newly sent local messages before the Firestore snapshot lands.
 */
export function resolveMessageRoomId(
    msgId: string,
    historyById: ReadonlyMap<string, Message>,
    optimisticRoomById?: ReadonlyMap<string, string>,
): string | null {
    const persisted = historyById.get(msgId)?.roomId;
    if (typeof persisted === 'string' && persisted.trim().length > 0) {
        return persisted;
    }
    const optimistic = optimisticRoomById?.get(msgId);
    if (typeof optimistic === 'string' && optimistic.trim().length > 0) {
        return optimistic;
    }
    return null;
}

/**
 * Filter chat messages for the selected room tab without mutating the underlying
 * single-session message array.
 *
 * When `isLoading` is true for a turn sent in `inFlightRoomId`, the trailing
 * streaming assistant message (which has no Firestore document yet) stays visible
 * in that room's tab and never leaks into other rooms.
 */
export function filterMessagesByRoom(
    messages: readonly UIMessage[],
    options: FilterMessagesOptions,
): UIMessage[] {
    const { filter, historyById, optimisticRoomById, isLoading = false, inFlightRoomId = null } = options;
    if (filter === 'all') {
        return [...messages];
    }

    const lastIndex = messages.length - 1;
    return messages.filter((msg, idx) => {
        if (msg.id === WELCOME_MSG_ID) return false;
        const resolved = resolveMessageRoomId(msg.id, historyById, optimisticRoomById);
        if (resolved === filter) return true;
        if (
            resolved === null &&
            isLoading &&
            inFlightRoomId === filter &&
            idx === lastIndex &&
            msg.role === 'assistant'
        ) {
            return true;
        }
        return false;
    });
}

/**
 * Count visible user/assistant messages per room_id for chip badges.
 */
export function countMessagesByRoom(
    messages: readonly UIMessage[],
    historyById: ReadonlyMap<string, Message>,
    optimisticRoomById?: ReadonlyMap<string, string>,
): ReadonlyMap<string, number> {
    const counts = new Map<string, number>();
    for (const msg of messages) {
        if (msg.id === WELCOME_MSG_ID) continue;
        if (msg.role !== 'user' && msg.role !== 'assistant') continue;
        const roomId = resolveMessageRoomId(msg.id, historyById, optimisticRoomById);
        if (!roomId) continue;
        counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
    }
    return counts;
}
