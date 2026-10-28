/** localStorage keys of the chat session (useChatSession, logout, guest claim). */

/** The guest's persistent chat session id. */
export const GUEST_SESSION_KEY = 'chatSessionId';

/** The project the chat reopens for a signed-in user. */
export const lastProjectKey = (uid: string): string => `last_active_project:${uid}`;
