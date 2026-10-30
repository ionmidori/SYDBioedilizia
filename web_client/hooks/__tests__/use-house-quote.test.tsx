import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHouseQuote, useRefreshHouseQuote } from '../use-house-quote';
import { quotesApi } from '@/lib/quotes-api';

jest.mock('@/lib/quotes-api', () => ({ quotesApi: { getQuote: jest.fn() } }));
const getQuote = quotesApi.getQuote as jest.Mock;

function wrapperWith(client: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

beforeEach(() => getQuote.mockReset());

describe('useHouseQuote', () => {
    it('asks for nothing until the chat is known', () => {
        const client = new QueryClient();
        renderHook(() => useHouseQuote(null), { wrapper: wrapperWith(client) });

        expect(getQuote).not.toHaveBeenCalled();
    });

    it('reads the quote again after a chat turn, when the agent may have changed it', async () => {
        getQuote.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'draft' });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const { result } = renderHook(
            () => ({ quote: useHouseQuote('chat-1'), refresh: useRefreshHouseQuote() }),
            { wrapper: wrapperWith(client) },
        );
        await waitFor(() => expect(result.current.quote.isSuccess).toBe(true));
        expect(result.current.quote.data).toBeNull();

        await act(() => result.current.refresh());

        await waitFor(() => expect(result.current.quote.data).toEqual({ status: 'draft' }));
        expect(getQuote).toHaveBeenNthCalledWith(2, 'chat-1');
    });
});
