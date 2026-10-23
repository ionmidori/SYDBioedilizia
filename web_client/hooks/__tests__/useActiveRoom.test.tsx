import { act, renderHook } from '@testing-library/react';
import { ACTIVE_ROOM_EVENT, useActiveRoom } from '../useActiveRoom';
import type { RoomChip } from '../useProjectRooms';

const KITCHEN: RoomChip = { room_id: 'r_cucina', label: 'Cucina', room_type: 'cucina' };
const BATH: RoomChip = { room_id: 'r_bagno', label: 'Bagno', room_type: 'bagno' };
const NEW_ROOM: RoomChip = { room_id: 'r_camera', label: 'Camera', room_type: 'camera' };

beforeEach(() => localStorage.clear());

describe('useActiveRoom', () => {
    it('has no active room without a project or rooms', () => {
        expect(renderHook(() => useActiveRoom(null, [KITCHEN])).result.current.activeRoomId).toBeNull();
        expect(renderHook(() => useActiveRoom('p1', [])).result.current.activeRoomId).toBeNull();
    });

    it('preselects the newest room', () => {
        expect(renderHook(() => useActiveRoom('p1', [KITCHEN, BATH])).result.current.activeRoomId).toBe('r_bagno');
    });

    it('remembers the room chosen for the project', () => {
        const first = renderHook(() => useActiveRoom('p1', [KITCHEN, BATH]));
        act(() => first.result.current.setActiveRoomId('r_cucina'));
        expect(first.result.current.activeRoomId).toBe('r_cucina');

        // Reload: the choice comes back from storage.
        expect(renderHook(() => useActiveRoom('p1', [KITCHEN, BATH])).result.current.activeRoomId).toBe('r_cucina');
        // Another project does not inherit it.
        expect(renderHook(() => useActiveRoom('p2', [KITCHEN, BATH])).result.current.activeRoomId).toBe('r_bagno');
    });

    it('follows the agent, also to a room the listener has not delivered yet', () => {
        const { result, rerender } = renderHook(({ rooms }) => useActiveRoom('p1', rooms), {
            initialProps: { rooms: [KITCHEN, BATH] },
        });

        act(() => {
            window.dispatchEvent(new CustomEvent(ACTIVE_ROOM_EVENT, { detail: { type: 'active_room', roomId: 'r_camera' } }));
        });
        // Not in the list yet: the chips keep showing a room that exists.
        expect(['r_cucina', 'r_bagno']).toContain(result.current.activeRoomId);

        rerender({ rooms: [KITCHEN, BATH, NEW_ROOM] });
        expect(result.current.activeRoomId).toBe('r_camera');
    });

    it('ignores malformed events', () => {
        const { result } = renderHook(() => useActiveRoom('p1', [KITCHEN, BATH]));
        act(() => {
            window.dispatchEvent(new CustomEvent(ACTIVE_ROOM_EVENT, { detail: { roomId: 42 } }));
        });
        expect(result.current.activeRoomId).toBe('r_bagno');
    });
});
