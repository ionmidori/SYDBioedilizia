import { act, renderHook } from '@testing-library/react';
import { ACTIVE_ROOM_EVENT } from '@/hooks/useActiveRoom';
import { useRoomFilter } from '@/hooks/useRoomFilter';
import type { RoomChip } from '@/hooks/useProjectRooms';

const ROOMS: RoomChip[] = [
    { room_id: 'r_bagno', label: 'Bagno', room_type: 'bagno' },
    { room_id: 'r_cucina', label: 'Cucina', room_type: 'cucina' },
];

describe('useRoomFilter', () => {
    it('defaults to "all" with null filteredRoomLabel', () => {
        const onSelectActiveRoom = jest.fn();
        const { result } = renderHook(() =>
            useRoomFilter({ projectId: 'p1', rooms: ROOMS, onSelectActiveRoom }),
        );

        expect(result.current.roomFilter).toBe('all');
        expect(result.current.filteredRoomLabel).toBeNull();
    });

    it('updates both view filter and activeRoomId when selecting a room', () => {
        const onSelectActiveRoom = jest.fn();
        const { result } = renderHook(() =>
            useRoomFilter({ projectId: 'p1', rooms: ROOMS, onSelectActiveRoom }),
        );

        act(() => result.current.selectFilter('r_bagno'));

        expect(result.current.roomFilter).toBe('r_bagno');
        expect(result.current.filteredRoomLabel).toBe('Bagno');
        expect(onSelectActiveRoom).toHaveBeenCalledWith('r_bagno');
    });

    it('does not change activeRoomId when selecting "all"', () => {
        const onSelectActiveRoom = jest.fn();
        const { result } = renderHook(() =>
            useRoomFilter({ projectId: 'p1', rooms: ROOMS, onSelectActiveRoom }),
        );

        act(() => result.current.selectFilter('r_bagno'));
        onSelectActiveRoom.mockClear();

        act(() => result.current.selectFilter('all'));

        expect(result.current.roomFilter).toBe('all');
        expect(result.current.filteredRoomLabel).toBeNull();
        expect(onSelectActiveRoom).not.toHaveBeenCalled();
    });

    it('follows ACTIVE_ROOM_EVENT only when currently scoped to a room, not in "all"', () => {
        const onSelectActiveRoom = jest.fn();
        const { result } = renderHook(() =>
            useRoomFilter({ projectId: 'p1', rooms: ROOMS, onSelectActiveRoom }),
        );

        // In "all": stays on "all"
        act(() => {
            window.dispatchEvent(new CustomEvent(ACTIVE_ROOM_EVENT, { detail: { roomId: 'r_cucina' } }));
        });
        expect(result.current.roomFilter).toBe('all');

        // Scoped to Bagno: follows agent switch to Cucina
        act(() => result.current.selectFilter('r_bagno'));
        act(() => {
            window.dispatchEvent(new CustomEvent(ACTIVE_ROOM_EVENT, { detail: { roomId: 'r_cucina' } }));
        });
        expect(result.current.roomFilter).toBe('r_cucina');
        expect(result.current.filteredRoomLabel).toBe('Cucina');
    });

    it('falls back to "all" when the selected room disappears or projectId changes', () => {
        const onSelectActiveRoom = jest.fn();
        const { result, rerender } = renderHook(
            ({ projectId, rooms }) =>
                useRoomFilter({ projectId, rooms, onSelectActiveRoom }),
            { initialProps: { projectId: 'p1' as string | null, rooms: ROOMS } },
        );

        act(() => result.current.selectFilter('r_bagno'));
        expect(result.current.roomFilter).toBe('r_bagno');

        // Room removed
        rerender({ projectId: 'p1', rooms: [ROOMS[1]] });
        expect(result.current.roomFilter).toBe('all');

        // Re-select and switch project
        act(() => result.current.selectFilter('r_cucina'));
        expect(result.current.roomFilter).toBe('r_cucina');
        rerender({ projectId: 'p2', rooms: ROOMS });
        expect(result.current.roomFilter).toBe('all');
    });
});
