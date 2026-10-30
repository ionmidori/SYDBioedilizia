/** localStorage keys of the chat session (useChatSession, logout, guest claim). */

/** The guest's persistent chat session id. A signed-in user's chat id is never
 *  stored: it comes from the backend (GET /api/me/chat). */
export const GUEST_SESSION_KEY = 'chatSessionId';
