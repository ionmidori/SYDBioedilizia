import { z } from 'zod';
import { fetchValidated } from '@/lib/api-client';
import { roomCreateSchema, roomSchema, type Room, type RoomCreate } from '@/types/room';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

/**
 * Rooms of a project (Phase 138). Reads come from Firestore (`useProjectRooms`);
 * writes go through the backend, the only writer of `projects/{id}/rooms`.
 */
export const roomsApi = {
    /**
     * Rooms in creation order. A project created before rooms existed gets its
     * "Generale" room (holding its files) on this first listing.
     */
    listRooms: (projectId: string): Promise<Room[]> =>
        fetchValidated(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/rooms`, z.array(roomSchema)),

    createRoom: (projectId: string, data: RoomCreate): Promise<Room> =>
        fetchValidated(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/rooms`, roomSchema, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roomCreateSchema.parse(data)),
        }),
};
