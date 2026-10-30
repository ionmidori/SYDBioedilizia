import { userChatApi } from '@/lib/user-chat-api';

/** Prefix of the user-chat queries: invalidate it to ask /api/me/chat again. */
export const USER_CHAT_QUERY_KEY = ['me', 'chat'] as const;

/**
 * The signed-in user's chat as a query: the backend's answer only changes when
 * the chat does (a merge, a guest claim), so it is asked again on purpose, never
 * because it got old.
 */
export function userChatQuery(uid: string) {
    return {
        queryKey: [...USER_CHAT_QUERY_KEY, uid] as const,
        queryFn: userChatApi.getMyChat,
        staleTime: Infinity,
    };
}
