import { isChatMovedError } from '../chat-moved';

/** The shape of the AI SDK's APICallError for a non-2xx answer of /api/chat
 *  (`ai` is ESM-only: Jest cannot load the real class). */
function apiError(statusCode: number, body: string): Error {
    return Object.assign(new Error(body), { name: 'AI_APICallError', statusCode, responseBody: body });
}

const body = (error_code: string) => JSON.stringify({ error_code, message: 'Ricarica la pagina per continuare.' });

describe('isChatMovedError', () => {
    it.each(['CHAT_MERGED', 'USER_CHAT_MISMATCH'])('recognises a 409 %s from /chat/stream', (code) => {
        expect(isChatMovedError(apiError(409, body(code)))).toBe(true);
    });

    it.each([
        ['another 409', apiError(409, body('IDEMPOTENCY_CONFLICT'))],
        ['the code on another status', apiError(403, body('CHAT_MERGED'))],
        ['a body that is not JSON', apiError(409, 'Conflict')],
        ['a plain error with the same text', new Error(body('CHAT_MERGED'))],
        ['no error', undefined],
    ])('ignores %s', (_label, error) => {
        expect(isChatMovedError(error)).toBe(false);
    });
});
