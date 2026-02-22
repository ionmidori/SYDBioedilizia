import { renderHook, waitFor, act } from '@testing-library/react';
import { useChatHistory } from '../useChatHistory';

// Mock useAuth
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'test-user-123', email: 'test@example.com' },
        loading: false,
    }),
}));

// Mock firebase/firestore onSnapshot to allow us to control when callbacks fire
let mockOnSnapshotCallback: ((snapshot: any) => void) | null = null;
let mockOnSnapshotError: ((error: any) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(() => ({})),
    query: jest.fn((...args: any[]) => args[0]),
    orderBy: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn((q: any, successCb: any, errorCb: any) => {
        mockOnSnapshotCallback = successCb;
        mockOnSnapshotError = errorCb;
        return mockUnsubscribe;
    }),
    getFirestore: jest.fn(() => ({})),
    enableMultiTabIndexedDbPersistence: jest.fn(() => Promise.resolve()),
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

// Mock @/lib/firebase to provide db
jest.mock('@/lib/firebase', () => ({
    db: {},
    auth: {},
    storage: {},
    appCheck: null,
}));

// Helper: create a mock Firestore snapshot
function makeSnapshot(docs: any[]) {
    return {
        docs: docs.map(data => ({
            id: data.id,
            data: () => data,
        })),
    };
}

// Helper: wait for onSnapshot to be registered, then fire with data
async function waitAndFire(data: any[]) {
    await waitFor(() => {
        expect(mockOnSnapshotCallback).not.toBeNull();
    });
    act(() => {
        mockOnSnapshotCallback?.(makeSnapshot(data));
    });
}

async function waitAndFireError(error: Error) {
    await waitFor(() => {
        expect(mockOnSnapshotError).not.toBeNull();
    });
    act(() => {
        mockOnSnapshotError?.(error);
    });
}

describe('useChatHistory', () => {
    const mockSessionId = 'test-session-123';

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnSnapshotCallback = null;
        mockOnSnapshotError = null;
    });

    it('should initialize with isLoading true and empty history', () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        // Before onSnapshot fires, should be loading
        expect(result.current.isLoading).toBe(true);
        expect(result.current.historyMessages).toEqual([]);
        expect(result.current.historyLoaded).toBe(false);
    });

    it('should set historyLoaded to true after snapshot fires', async () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitAndFire([]);

        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
        });

        expect(result.current.historyMessages).toEqual([]);
        expect(result.current.error).toBeUndefined();
    });

    it('should not fetch when sessionId is undefined', async () => {
        const { result } = renderHook(() => useChatHistory(undefined));

        // With no sessionId, shouldFetch=false → isLoading set to false immediately
        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
        });

        // onSnapshot should not have been called
        const { onSnapshot } = require('firebase/firestore');
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('should transform Firestore documents to Message format', async () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitAndFire([
            { id: 'msg-1', role: 'user', content: 'Hello', timestamp: { toDate: () => new Date('2026-01-01') } },
            { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: { toDate: () => new Date('2026-01-02') } },
        ]);

        await waitFor(() => {
            expect(result.current.historyMessages).toHaveLength(2);
        });

        // Docs come in DESC order (newest first), reversed to chronological
        const msgs = result.current.historyMessages;
        expect(msgs[0]).toMatchObject({ id: 'msg-2', role: 'assistant', content: 'Hi there!' });
        expect(msgs[1]).toMatchObject({ id: 'msg-1', role: 'user', content: 'Hello' });
    });

    it('should handle snapshot errors gracefully', async () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        const testError = new Error('Firestore permission denied');
        await waitAndFireError(testError);

        await waitFor(() => {
            expect(result.current.error).toBeDefined();
        });

        expect(result.current.error).toEqual(testError);
        expect(result.current.isLoading).toBe(false);
    });

    it('should parse tool_calls from Firestore messages', async () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitAndFire([
            {
                id: 'msg-1',
                role: 'assistant',
                content: 'Analyzing...',
                tool_calls: [
                    { id: 'tc-1', function: { name: 'analyze_room', arguments: '{"url":"test"}' } }
                ],
            },
        ]);

        await waitFor(() => {
            expect(result.current.historyMessages).toHaveLength(1);
        });

        const msg = result.current.historyMessages[0];
        expect(msg.toolInvocations).toBeDefined();
        expect(msg.toolInvocations![0]).toMatchObject({
            toolCallId: 'tc-1',
            toolName: 'analyze_room',
            state: 'result',
        });
    });

    it('should strip attachment markers from content', async () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitAndFire([
            {
                id: 'msg-1',
                role: 'user',
                content: '[Immagine allegata: room.jpg] Analyze this',
                attachments: { images: ['https://storage.example.com/room.jpg'] },
            },
        ]);

        await waitFor(() => {
            expect(result.current.historyMessages).toHaveLength(1);
        });

        const msg = result.current.historyMessages[0];
        expect(msg.content).toBe('Analyze this');
        expect((msg.attachments as any)?.images).toContain('https://storage.example.com/room.jpg');
    });

    it('should expose mutate function', () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));
        expect(typeof result.current.mutate).toBe('function');
    });

    it('should unsubscribe from Firestore on unmount', async () => {
        const { unmount } = renderHook(() => useChatHistory(mockSessionId));

        // Wait for subscription to be registered
        await waitFor(() => {
            expect(mockOnSnapshotCallback).not.toBeNull();
        });

        unmount();
        expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should handle messages without timestamp gracefully', async () => {
        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitAndFire([
            { id: 'msg-1', role: 'user', content: 'Hello' }, // no timestamp
        ]);

        await waitFor(() => {
            expect(result.current.historyMessages).toHaveLength(1);
        });

        const msg = result.current.historyMessages[0];
        expect(msg.createdAt).toBeInstanceOf(Date);
    });
});
