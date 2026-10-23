import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomChip } from '@/hooks/useProjectRooms';

/** DOM event dispatched by useAdkStreamEvents when the agent picks a room (`select_room`). */
export const ACTIVE_ROOM_EVENT = 'adk-active-room';

const storageKey = (projectId: string) => `active_room:${projectId}`;

function readStoredRoom(projectId: string): string | null {
    try {
        return localStorage.getItem(storageKey(projectId));
    } catch {
        return null;
    }
}

function storeRoom(projectId: string, roomId: string): void {
    try {
        localStorage.setItem(storageKey(projectId), roomId);
    } catch {
        // Private mode / blocked storage: the choice lasts for this page only.
    }
}

interface UseActiveRoomReturn {
    /** Room the next message and uploads belong to; `null` without rooms. */
    activeRoomId: string | null;
    setActiveRoomId: (roomId: string) => void;
}

/**
 * The project's active room (Phase 138: one chat for the whole home).
 *
 * Derived during render: the room the user (or the agent) chose last, else the
 * one remembered for this project, else the newest room. A choice that is not
 * (yet) among `rooms` — a room the agent has just created — takes effect as
 * soon as the rooms listener delivers it.
 */
export function useActiveRoom(projectId: string | null, rooms: RoomChip[]): UseActiveRoomReturn {
    const [chosen, setChosen] = useState<{ projectId: string; roomId: string } | null>(null);

    const activeRoomId = useMemo(() => {
        if (!projectId || rooms.length === 0) return null;
        const exists = (id: string | null | undefined) => !!id && rooms.some((r) => r.room_id === id);
        if (chosen?.projectId === projectId && exists(chosen.roomId)) return chosen.roomId;
        const stored = readStoredRoom(projectId);
        if (exists(stored)) return stored;
        return rooms[rooms.length - 1].room_id;
    }, [projectId, rooms, chosen]);

    const setActiveRoomId = useCallback(
        (roomId: string) => {
            if (!projectId) return;
            setChosen({ projectId, roomId });
            storeRoom(projectId, roomId);
        },
        [projectId],
    );

    // The agent moved the conversation to another room: the chip follows.
    useEffect(() => {
        const onActiveRoom = (event: Event) => {
            const roomId = (event as CustomEvent<{ roomId?: unknown }>).detail?.roomId;
            if (typeof roomId === 'string') setActiveRoomId(roomId);
        };
        window.addEventListener(ACTIVE_ROOM_EVENT, onActiveRoom);
        return () => window.removeEventListener(ACTIVE_ROOM_EVENT, onActiveRoom);
    }, [setActiveRoomId]);

    return { activeRoomId, setActiveRoomId };
}
