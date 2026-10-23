/**
 * Rooms of a project (/api/projects/{id}/rooms) — Golden Sync with
 * backend_python/src/schemas/room.py (Phase 138: one chat for the whole home).
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

/** Same values and order as RoomType / ROOM_TYPES in the backend schema. */
export const ROOM_TYPES = ['cucina', 'soggiorno', 'camera', 'bagno', 'corridoio', 'altro'] as const;
export const roomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof roomTypeSchema>;

/** Same pattern as ROOM_ID_PATTERN in the backend schema. */
export const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const roomIdSchema = z.string().regex(ROOM_ID_PATTERN);

const roomLabelSchema = z.string().trim().min(1).max(60);
const briefTextSchema = z.string().trim().max(1000);
const briefListSchema = z.array(z.string().trim().min(1).max(300)).max(20).default([]);

export const roomBriefSchema = z
    .object({
        floor_mq: z.number().min(0).max(10_000).nullable().optional(),
        walls_mq: z.number().min(0).max(10_000).nullable().optional(),
        height_m: z.number().min(0).max(20).nullable().optional(),
        surfaces: briefTextSchema.nullable().optional(),
        systems: briefTextSchema.nullable().optional(),
        fixtures: briefTextSchema.nullable().optional(),
        criticalities: briefListSchema,
        decisions: briefListSchema,
        open_questions: briefListSchema,
    })
    .strict();
export type RoomBrief = z.infer<typeof roomBriefSchema>;

export const roomSchema = z
    .object({
        room_id: roomIdSchema,
        label: roomLabelSchema,
        room_type: roomTypeSchema,
        created_at: z.string().datetime({ offset: true }),
        updated_at: z.string().datetime({ offset: true }),
        brief: roomBriefSchema,
        reference_photo_id: z.string().nullable().optional(),
        summary: z.string().max(500).nullable().optional(),
    })
    .strict();
export type Room = z.infer<typeof roomSchema>;

/** Body of POST /api/projects/{id}/rooms. */
export const roomCreateSchema = z.object({ label: roomLabelSchema, room_type: roomTypeSchema }).strict();
export type RoomCreate = z.infer<typeof roomCreateSchema>;

/** Body of PATCH /api/projects/{id}/rooms/{room_id}: rename and/or change the type. */
export const roomUpdateSchema = z
    .object({ label: roomLabelSchema.optional(), room_type: roomTypeSchema.optional() })
    .strict()
    .refine((u) => u.label !== undefined || u.room_type !== undefined, {
        message: 'Indica il nome o il tipo della stanza',
    });
export type RoomUpdate = z.infer<typeof roomUpdateSchema>;

/** Body of PATCH /api/projects/{id}/files/{file_id}: move a file to a room. */
export const fileRoomUpdateSchema = z.object({ room_id: roomIdSchema }).strict();
export type FileRoomUpdate = z.infer<typeof fileRoomUpdateSchema>;
