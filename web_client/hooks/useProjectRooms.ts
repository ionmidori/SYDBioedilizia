import { useEffect, useState } from 'react';
import { roomsApi } from '@/lib/rooms-api';
import { logger } from '@/lib/logger';
import { roomIdSchema, roomTypeSchema, type RoomType } from '@/types/room';
import { z } from 'zod';

/** What the room chips need of a room (the full brief stays on the server). */
export interface RoomChip {
    room_id: string;
    label: string;
    room_type: RoomType;
}

// Firestore stores timestamps as Timestamp objects, not the API's ISO strings:
// only the fields the chips use are validated here.
const roomChipSchema = z.object({
    room_id: roomIdSchema,
    label: z.string().min(1),
    room_type: roomTypeSchema,
});

interface UseProjectRoomsReturn {
    rooms: RoomChip[];
    /** Id of the project `rooms` were loaded for (`null` until the first snapshot). */
    loadedFor: string | null;
}

// Stable identity: consumers memoize on `rooms`.
const NO_ROOMS: UseProjectRoomsReturn = { rooms: [], loadedFor: null };

/**
 * Live rooms of a project (`projects/{id}/rooms`, readable by its owner), in
 * creation order. Pass `null` when the chat has no project (guest, global
 * chat): no listener is opened.
 *
 * An empty first snapshot calls the REST listing once, which creates the
 * "Generale" room of a project that predates rooms; the listener then
 * receives it like any other room.
 */
export function useProjectRooms(projectId: string | null): UseProjectRoomsReturn {
    const [state, setState] = useState<UseProjectRoomsReturn>({ rooms: [], loadedFor: null });

    useEffect(() => {
        if (!projectId) return;
        let isMounted = true;
        let unsubscribe: (() => void) | undefined;
        let defaultRequested = false;

        (async () => {
            const { db } = await import('@/lib/firebase');
            const { collection, query, orderBy, onSnapshot } = await import('firebase/firestore');
            if (!isMounted) return;
            const q = query(collection(db, 'projects', projectId, 'rooms'), orderBy('created_at'));
            unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    const rooms = snapshot.docs.flatMap((doc) => {
                        const parsed = roomChipSchema.safeParse(doc.data());
                        return parsed.success ? [parsed.data] : [];
                    });
                    setState({ rooms, loadedFor: projectId });
                    if (rooms.length === 0 && !defaultRequested) {
                        defaultRequested = true;
                        roomsApi.listRooms(projectId).catch((err: unknown) => {
                            logger.debug('[useProjectRooms] Default room not created:', err);
                        });
                    }
                },
                (err) => {
                    // No access (not the owner, project not created yet): no chips.
                    logger.debug('[useProjectRooms] Rooms listener error:', err);
                    setState({ rooms: [], loadedFor: projectId });
                },
            );
        })();

        return () => {
            isMounted = false;
            unsubscribe?.();
        };
    }, [projectId]);

    // Rooms of a previous project are never shown for the current one.
    return state.loadedFor === projectId ? state : NO_ROOMS;
}
