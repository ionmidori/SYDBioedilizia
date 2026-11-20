import { fetchValidated } from '@/lib/api-client';
import {
    clearChatRequestSchema,
    clearChatResponseSchema,
    type ClearChatRequest,
    type ClearChatResponse,
} from '@/types/chat-clear';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

/**
 * Client for clearing or restarting a chat session or single room
 * (`POST /api/chat/{session_id}/clear`).
 */
export const chatClearApi = {
    clearChat: async (
        sessionId: string,
        request: ClearChatRequest = { room_id: null },
    ): Promise<ClearChatResponse> =>
        fetchValidated(`${API_ROOT}/chat/${encodeURIComponent(sessionId)}/clear`, clearChatResponseSchema, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clearChatRequestSchema.parse(request)),
        }),
};
