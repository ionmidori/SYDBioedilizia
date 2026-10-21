import { renderHook, waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useChatHistory } from '../useChatHistory';

// Anonymous Firebase user (e.g. right after logout, which signs in anonymously
// again, or a guest with a fresh session UUID): the session document does not
// exist until the first message, so the Firestore rules deny the listener.
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'anon-1', isAnonymous: true },
        loading: false,
    }),
}));

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(() => ({})),
    query: jest.fn((...args: unknown[]) => args[0]),
    orderBy: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
    db: {},
    auth: { currentUser: { uid: 'anon-1', isAnonymous: true } },
    storage: {},
    appCheck: null,
}));

const mockOnSnapshot = onSnapshot as jest.Mock;

function failListenerWith(code: string) {
    mockOnSnapshot.mockImplementation((_q, _opts, _next, onError: (e: unknown) => void) => {
        onError(Object.assign(new Error(code), { code }));
        return jest.fn();
    });
}

describe('useChatHistory (anonymous user, session not saved yet)', () => {
    const sessionId = 'fresh-guest-session';

    beforeEach(() => mockOnSnapshot.mockReset());

    it('treats a denied listener as an empty new chat, so the welcome message can appear', async () => {
        failListenerWith('permission-denied');
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useChatHistory(sessionId));

        await waitFor(() => expect(result.current.historyLoaded).toBe(true));
        expect(result.current.historyMessages).toEqual([]);
        // planHistorySync waits for loadedForSessionId === sessionId before the
        // cold-start welcome: before the fix it stayed undefined forever.
        expect(result.current.loadedForSessionId).toBe(sessionId);
        expect(result.current.error).toBeUndefined();
    });

    it('subscribes again later: the session appears with the first message', async () => {
        jest.useFakeTimers();
        try {
            failListenerWith('permission-denied');
            const { result } = renderHook(() => useChatHistory(sessionId));
            await waitFor(() => expect(result.current.loadedForSessionId).toBe(sessionId));
            expect(mockOnSnapshot).toHaveBeenCalledTimes(1);

            // The backend has now created the session: the next attempt succeeds.
            mockOnSnapshot.mockImplementation((_q, _opts, next: (s: unknown) => void) => {
                next({ docs: [] });
                return jest.fn();
            });
            await jest.advanceTimersByTimeAsync(2_000);

            expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
            expect(result.current.error).toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });

    it('still reports other listener errors', async () => {
        failListenerWith('unavailable');
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useChatHistory(sessionId));

        await waitFor(() => expect(result.current.error).toBeDefined());
    });
});
