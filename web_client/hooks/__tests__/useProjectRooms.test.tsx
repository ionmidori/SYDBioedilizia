import { act, renderHook, waitFor } from '@testing-library/react';
import { useProjectRooms } from '../useProjectRooms';
import { roomsApi } from '@/lib/rooms-api';
import { collection, onSnapshot } from 'firebase/firestore';

let mockOnNext: ((snapshot: unknown) => void) | null = null;
let mockOnError: ((error: Error) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('firebase/firestore', () => ({
    collection: jest.fn((...path: unknown[]) => ({ path: path.slice(1).join('/') })),
    query: jest.fn((ref: unknown) => ref),
    orderBy: jest.fn(),
    onSnapshot: jest.fn((_q: unknown, next: (s: unknown) => void, error: (e: Error) => void) => {
        mockOnNext = next;
        mockOnError = error;
        return mockUnsubscribe;
    }),
}));

jest.mock('@/lib/firebase', () => ({ db: {} }));

jest.mock('@/lib/rooms-api', () => ({
    roomsApi: { listRooms: jest.fn(() => Promise.resolve([])), createRoom: jest.fn() },
}));

const snapshot = (rooms: Record<string, unknown>[]) => ({ docs: rooms.map((data) => ({ data: () => data })) });
const KITCHEN = { room_id: 'r_cucina', label: 'Cucina', room_type: 'cucina', created_at: { seconds: 1 } };

async function listening() {
    await waitFor(() => expect(mockOnNext).not.toBeNull());
}

beforeEach(() => {
    jest.clearAllMocks();
    mockOnNext = null;
    mockOnError = null;
});

describe('useProjectRooms', () => {
    it('opens no listener without a project', () => {
        const { result } = renderHook(() => useProjectRooms(null));
        expect(result.current.rooms).toEqual([]);
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    it('listens to the project rooms and keeps only valid ones', async () => {
        const { result } = renderHook(() => useProjectRooms('p1'));
        await listening();
        expect(collection).toHaveBeenCalledWith({}, 'projects', 'p1', 'rooms');

        act(() => mockOnNext!(snapshot([KITCHEN, { room_id: 'bad/id', label: 'x', room_type: 'cucina' }])));
        expect(result.current.rooms).toEqual([{ room_id: 'r_cucina', label: 'Cucina', room_type: 'cucina' }]);
        expect(result.current.loadedFor).toBe('p1');
    });

    it('asks the backend once for the default room of a project without rooms', async () => {
        renderHook(() => useProjectRooms('p1'));
        await listening();
        act(() => mockOnNext!(snapshot([])));
        act(() => mockOnNext!(snapshot([])));
        expect(roomsApi.listRooms).toHaveBeenCalledTimes(1);
        expect(roomsApi.listRooms).toHaveBeenCalledWith('p1');
    });

    it('shows no rooms when the listener is denied', async () => {
        const { result } = renderHook(() => useProjectRooms('p1'));
        await listening();
        act(() => mockOnNext!(snapshot([KITCHEN])));
        act(() => mockOnError!(new Error('permission-denied')));
        expect(result.current.rooms).toEqual([]);
    });

    it('never shows the previous project rooms and unsubscribes on change', async () => {
        const { result, rerender } = renderHook(({ id }) => useProjectRooms(id), { initialProps: { id: 'p1' } });
        await listening();
        act(() => mockOnNext!(snapshot([KITCHEN])));
        mockOnNext = null;

        rerender({ id: 'p2' });
        expect(result.current.rooms).toEqual([]);
        expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
        await listening();
    });
});
