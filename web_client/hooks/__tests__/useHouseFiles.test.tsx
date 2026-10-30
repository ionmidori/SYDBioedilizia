import { act, renderHook, waitFor } from '@testing-library/react';
import { useHouseFiles } from '../useHouseFiles';
import { collection, onSnapshot, orderBy } from 'firebase/firestore';

let mockOnNext: ((snapshot: unknown) => void) | null = null;
let mockOnError: ((error: { code: string; message: string }) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('firebase/firestore', () => ({
    collection: jest.fn((...path: unknown[]) => ({ path: path.slice(1).join('/') })),
    query: jest.fn((ref: unknown) => ref),
    orderBy: jest.fn(),
    onSnapshot: jest.fn((_q: unknown, next: (s: unknown) => void, error: (e: { code: string; message: string }) => void) => {
        mockOnNext = next;
        mockOnError = error;
        return mockUnsubscribe;
    }),
}));
let mockDb: object | null = {};
jest.mock('@/lib/firebase', () => ({
    get db() {
        return mockDb;
    },
}));

const at = (iso: string) => ({ toDate: () => new Date(iso) });
const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {};
    mockOnNext = null;
    mockOnError = null;
});

describe('useHouseFiles (the media of the house, live)', () => {
    it('opens no listener before the chat is known', () => {
        const { result } = renderHook(() => useHouseFiles(null));

        expect(onSnapshot).not.toHaveBeenCalled();
        expect(result.current).toEqual({ assets: [], loaded: false, error: null });
    });

    it('says so when Firestore is not available, instead of loading forever', () => {
        mockDb = null;
        const { result } = renderHook(() => useHouseFiles('chat-1'));

        expect(onSnapshot).not.toHaveBeenCalled();
        expect(result.current).toEqual({ assets: [], loaded: true, error: expect.stringContaining('Non riusciamo') });
    });

    it('lists the files of the chat, newest first, each with its room', async () => {
        const { result, unmount } = renderHook(() => useHouseFiles('chat-1'));
        await waitFor(() => expect(mockOnNext).not.toBeNull());
        expect(collection).toHaveBeenCalledWith({}, 'projects', 'chat-1', 'files');
        expect(orderBy).toHaveBeenCalledWith('uploadedAt', 'desc');

        act(() => mockOnNext!({
            docs: [
                doc('r1', { type: 'render', url: 'https://cdn/r1.png', name: 'Render', uploadedAt: at('2026-10-30T10:00:00Z'), roomId: 'bagno', size: 3 }),
                doc('f1', { type: 'image', url: 'https://cdn/f1.jpg', name: 'bagno.jpg', uploadedAt: at('2026-10-29T10:00:00Z'), roomId: 'bagno' }),
                doc('d1', { type: 'document', url: 'https://cdn/d1.pdf', name: 'pianta.pdf', uploadedAt: at('2026-10-28T10:00:00Z') }),
            ],
        }));

        expect(result.current.loaded).toBe(true);
        expect(result.current.assets.map((a) => [a.id, a.type, a.metadata?.roomId ?? null])).toEqual([
            ['r1', 'render', 'bagno'],
            ['f1', 'image', 'bagno'],
            ['d1', 'quote', null],
        ]);
        expect(result.current.assets[1]).toMatchObject({
            url: 'https://cdn/f1.jpg', thumbnail: 'https://cdn/f1.jpg', title: 'bagno.jpg',
            metadata: { projectId: 'chat-1' },
        });

        unmount();
        expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('says why the files cannot be read', async () => {
        const { result } = renderHook(() => useHouseFiles('chat-1'));
        await waitFor(() => expect(mockOnError).not.toBeNull());

        act(() => mockOnError!({ code: 'permission-denied', message: 'denied' }));

        expect(result.current.error).toBe('Non hai i permessi per vedere i file della tua casa.');
        expect(result.current.loaded).toBe(true);
    });
});
