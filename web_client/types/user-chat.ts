/**
 * The signed-in user's chat (GET /api/me/chat) — Golden Sync with
 * backend_python/src/schemas/user_chat.py (Phase 139: one chat per user).
 *
 * IMPORTANT: Any change to the Pydantic model MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

export const userChatResponseSchema = z
    .object({
        chat_id: z.string().min(1),
        /** A new, empty chat was created by this call. */
        created: z.boolean(),
    })
    .strict();
export type UserChatResponse = z.infer<typeof userChatResponseSchema>;
