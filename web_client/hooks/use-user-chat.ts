import type { QueryClient } from '@tanstack/react-query';
import { userChatApi } from '@/lib/user-chat-api';
import type { UserChatResponse } from '@/types/user-chat';

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

/** Ask /api/me/chat again now, whatever the cache holds: the user's chat changed. */
export function fetchUserChat(client: QueryClient, uid: string): Promise<UserChatResponse> {
    return client.fetchQuery({ ...userChatQuery(uid), staleTime: 0 });
}
