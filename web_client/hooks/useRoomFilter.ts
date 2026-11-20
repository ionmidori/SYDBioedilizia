import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE_ROOM_EVENT } from '@/hooks/useActiveRoom';
import type { RoomChip } from '@/hooks/useProjectRooms';
import type { RoomViewFilter } from '@/lib/chat/room-filter';

export interface UseRoomFilterOptions {
    projectId: string | null;
    rooms: RoomChip[];
    onSelectActiveRoom: (roomId: string) => void;
}

export interface UseRoomFilterReturn {
    /** Active view filter: `'all'` shows every message, or a specific `room_id`. */
    roomFilter: RoomViewFilter;
    /** Select `'all'` (keeps activeRoomId unchanged) or a room (updates both filter and activeRoomId). */
    selectFilter: (filter: RoomViewFilter) => void;
    /** Label of the currently filtered room, or `null` when viewing `'all'`. */
    filteredRoomLabel: string | null;
}

/**
 * Decouples the chat's visible message filter (`'all' | room_id`) from the
 * active send target (`activeRoomId`).
 *
 * - Defaults to `'all'` so multi-room context and pre-room messages are visible.
 * - Picking a room chip updates BOTH the view filter and `activeRoomId`.
 * - Picking `'all'` widens the view without changing where new messages go.
 * - When the agent dispatches `ACTIVE_ROOM_EVENT`, follows only if the user is
 *   currently viewing a specific room (never yanks them out of `'all'`).
 * - Safely falls back to `'all'` if the filtered room disappears or project changes.
 */
export function useRoomFilter({
    projectId,
    rooms,
    onSelectActiveRoom,
}: UseRoomFilterOptions): UseRoomFilterReturn {
    const [selection, setSelection] = useState<{ projectId: string; filter: RoomViewFilter } | null>(null);

    const roomFilter: RoomViewFilter = useMemo(() => {
        if (!projectId || rooms.length === 0) return 'all';
        if (!selection || selection.projectId !== projectId) return 'all';
        if (selection.filter === 'all') return 'all';
        const exists = rooms.some((r) => r.room_id === selection.filter);
        return exists ? selection.filter : 'all';
    }, [projectId, rooms, selection]);

    const roomFilterRef = useRef<RoomViewFilter>(roomFilter);
    useEffect(() => {
        roomFilterRef.current = roomFilter;
    }, [roomFilter]);

    const selectFilter = useCallback(
        (filter: RoomViewFilter) => {
            if (!projectId) return;
            setSelection({ projectId, filter });
            if (filter !== 'all') {
                onSelectActiveRoom(filter);
            }
        },
        [projectId, onSelectActiveRoom],
    );

    // If the user is already scoped to a specific room and the agent switches rooms,
    // follow to the new room; if the user chose `'all'`, keep them in `'all'`.
    useEffect(() => {
        if (!projectId) return;
        const onActiveRoom = (event: Event) => {
            const roomId = (event as CustomEvent<{ roomId?: unknown }>).detail?.roomId;
            if (typeof roomId !== 'string' || roomId.trim().length === 0) return;
            if (roomFilterRef.current !== 'all') {
                setSelection({ projectId, filter: roomId.trim() });
            }
        };
        window.addEventListener(ACTIVE_ROOM_EVENT, onActiveRoom);
        return () => window.removeEventListener(ACTIVE_ROOM_EVENT, onActiveRoom);
    }, [projectId]);

    const filteredRoomLabel = useMemo(() => {
        if (roomFilter === 'all') return null;
        return rooms.find((r) => r.room_id === roomFilter)?.label ?? null;
    }, [roomFilter, rooms]);

    return { roomFilter, selectFilter, filteredRoomLabel };
}
