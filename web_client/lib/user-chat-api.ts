/**
 * The signed-in user's chat (Phase 139: one chat per user, chosen by the backend).
 *
 * Golden Sync with backend_python/src/schemas/user_chat.py (types/user-chat.ts).
 */
import { fetchValidated } from '@/lib/api-client';
import { userChatResponseSchema, type UserChatResponse } from '@/types/user-chat';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

export const userChatApi = {
    /** The user's chat id, assigned by the backend on the first call (403 for guests). */
    getMyChat: (): Promise<UserChatResponse> => fetchValidated(`${API_ROOT}/me/chat`, userChatResponseSchema),
};
