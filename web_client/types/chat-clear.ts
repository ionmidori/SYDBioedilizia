/**
 * Chat clear/restart schemas (POST /api/chat/{session_id}/clear) — Golden Sync with
 * backend_python/src/schemas/chat_clear.py.
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

import { roomIdSchema } from './room';

export const clearChatModeSchema = z.enum(['soft_archive', 'hard_delete']);
export type ClearChatMode = z.infer<typeof clearChatModeSchema>;

/** Body of POST /api/chat/{session_id}/clear. */
export const clearChatRequestSchema = z
    .object({
        room_id: roomIdSchema.nullable().optional(),
    })
    .strict();
export type ClearChatRequest = z.infer<typeof clearChatRequestSchema>;

/** Response of POST /api/chat/{session_id}/clear. */
export const clearChatResponseSchema = z
    .object({
        mode: clearChatModeSchema,
        room_id: roomIdSchema.nullable(),
        affected_count: z.number().int().nonnegative(),
        rooms_reset: z.number().int().nonnegative(),
    })
    .strict();
export type ClearChatResponse = z.infer<typeof clearChatResponseSchema>;
