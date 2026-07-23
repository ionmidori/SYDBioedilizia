import { quotesApi } from '@/lib/quotes-api';
import { createQueryWrapper } from '@/test-utils/query';
import { renderHook, waitFor } from '@testing-library/react';
import { useQuotes } from '../use-quotes';

type MockUser = { uid: string } | null;
let mockUser: MockUser = null;
let mockIsAnonymous = false;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, isAnonymous: mockIsAnonymous }),
}));

jest.mock('@/lib/quotes-api', () => ({
    quotesApi: { listUserQuotes: jest.fn() },
}));

const mockListUserQuotes = quotesApi.listUserQuotes as jest.Mock;

beforeEach(() => {
    mockUser = null;
    mockIsAnonymous = false;
    mockListUserQuotes.mockReset();
});

describe('useQuotes', () => {
    it("fetches the authenticated user's quotes", async () => {
        mockUser = { uid: 'u1' };
        const quotes = [{ project_id: 'p1' }];
        mockListUserQuotes.mockResolvedValue(quotes);

        const { result } = renderHook(() => useQuotes(), {
            wrapper: createQueryWrapper().wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(quotes);
        expect(mockListUserQuotes).toHaveBeenCalledWith('u1');
    });

    it('does not fetch when signed out', () => {
        const { result } = renderHook(() => useQuotes(), {
            wrapper: createQueryWrapper().wrapper,
        });

        expect(result.current.fetchStatus).toBe('idle');
        expect(mockListUserQuotes).not.toHaveBeenCalled();
    });

    it('does not fetch for anonymous users', () => {
        mockUser = { uid: 'anon' };
        mockIsAnonymous = true;

        const { result } = renderHook(() => useQuotes(), {
            wrapper: createQueryWrapper().wrapper,
        });

        expect(result.current.fetchStatus).toBe('idle');
        expect(mockListUserQuotes).not.toHaveBeenCalled();
    });
});
