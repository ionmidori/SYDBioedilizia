import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { quotesApi } from '@/lib/quotes-api';

/** Prefix of the house-quote queries: invalidate it when the quote may have changed. */
export const HOUSE_QUOTE_QUERY_KEY = ['quote'] as const;

/**
 * The quote of the house (the user's chat): `null` while there is none. The
 * agent writes it during a chat turn, so the chat asks for it again after each
 * turn (ChatProvider) and on window focus.
 */
export function useHouseQuote(chatId: string | null) {
    return useQuery({
        queryKey: [...HOUSE_QUOTE_QUERY_KEY, chatId],
        queryFn: () => quotesApi.getQuote(chatId!),
        enabled: chatId !== null,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
    });
}

/** Reads the quote of the house again (after a chat turn: the agent may have changed it). */
export function useRefreshHouseQuote() {
    const queryClient = useQueryClient();
    return useCallback(() => queryClient.invalidateQueries({ queryKey: HOUSE_QUOTE_QUERY_KEY }), [queryClient]);
}
