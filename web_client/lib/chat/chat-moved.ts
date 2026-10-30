import { CHAT_MOVED_CODES, readErrorBody } from '@/lib/chat/error-messages';

/** What the AI SDK's chat transport puts on the error of a non-2xx answer
 *  (APICallError): the HTTP status and the response text. */
interface HttpCallError {
    statusCode: number;
    responseBody?: string;
}

function isHttpCallError(error: unknown): error is HttpCallError {
    return error instanceof Error && typeof (error as Partial<HttpCallError>).statusCode === 'number';
}

/**
 * True when /chat/stream refused the turn because the chat is no longer the
 * user's (Phase 139): merged into the user's chat (`CHAT_MERGED`) or not the chat
 * `users/{uid}.chat_id` names (`USER_CHAT_MISMATCH`). The backend refuses it
 * before saving anything, so the turn can go again in the chat /api/me/chat gives.
 */
export function isChatMovedError(error: unknown): boolean {
    if (!isHttpCallError(error) || error.statusCode !== 409) return false;
    const code = readErrorBody(error.responseBody)?.error_code;
    return typeof code === 'string' && CHAT_MOVED_CODES.has(code);
}
