import { renderHook, waitFor } from '@testing-library/react';
import { useChatHistory } from '../useChatHistory';

// Guest / unauthenticated visitor: no Firebase user yet.
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({
        user: null,
        loading: false,
    }),
}));

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(() => ({})),
    query: jest.fn((...args: unknown[]) => args[0]),
    orderBy: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn(),
    getFirestore: jest.fn(() => ({})),
    doc: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    getDocs: jest.fn(),
    addDoc: jest.fn(),
    where: jest.fn(),
    increment: jest.fn(),
    serverTimestamp: jest.fn(() => new Date()),
}));

jest.mock('@/lib/firebase', () => ({
    db: {},
    auth: {},
    storage: {},
    appCheck: null,
}));

describe('useChatHistory (guest/unauthenticated)', () => {
    const guestSessionId = 'guest-session-abc';

    it('marks history as loaded AND records loadedForSessionId for the guest session', async () => {
        const { result } = renderHook(() => useChatHistory(guestSessionId));

        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
        });

        expect(result.current.historyMessages).toEqual([]);
        // This is the field `planHistorySync`'s `sessionMatches` guard relies on.
        // If it stays undefined, the cold-start welcome message is blocked forever
        // for unauthenticated visitors (sessionMatches === false).
        expect(result.current.loadedForSessionId).toBe(guestSessionId);
    });
});
