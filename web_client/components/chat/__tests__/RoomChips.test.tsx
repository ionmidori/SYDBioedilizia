import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoomChips } from '../RoomChips';
import { roomsApi } from '@/lib/rooms-api';
import type { RoomChip } from '@/hooks/useProjectRooms';

jest.mock('@/lib/rooms-api', () => ({
    roomsApi: { createRoom: jest.fn(), listRooms: jest.fn() },
}));

// Dialog on desktop / Vaul drawer on mobile: the switch is not under test here.
jest.mock('@/components/ui/responsive-drawer', () => ({
    ResponsiveDrawer: ({ open, title, children }: { open?: boolean; title?: string; children: React.ReactNode }) =>
        open ? (
            <div role="dialog" aria-label={title}>
                {children}
            </div>
        ) : null,
}));

const createRoom = roomsApi.createRoom as jest.Mock;

const ROOMS: RoomChip[] = [
    { room_id: 'r_cucina', label: 'Cucina', room_type: 'cucina' },
    { room_id: 'r_bagno', label: 'Bagno', room_type: 'bagno' },
];

function renderChips(activeRoomId: string | null = 'r_bagno') {
    const onSelect = jest.fn();
    render(<RoomChips projectId="p1" rooms={ROOMS} activeRoomId={activeRoomId} onSelect={onSelect} />);
    return onSelect;
}

beforeEach(() => jest.clearAllMocks());

describe('RoomChips', () => {
    it('shows one chip per room with the active one pressed', () => {
        renderChips();
        expect(screen.getByRole('toolbar', { name: 'Stanze del progetto' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Bagno' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Cucina' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('selects a room on tap', () => {
        const onSelect = renderChips();
        fireEvent.click(screen.getByRole('button', { name: 'Cucina' }));
        expect(onSelect).toHaveBeenCalledWith('r_cucina');
    });

    it('creates a room named after its type and makes it active', async () => {
        createRoom.mockResolvedValue({ room_id: 'r_new', label: 'Camera', room_type: 'camera' });
        const onSelect = renderChips();

        fireEvent.click(screen.getByRole('button', { name: 'Nuova stanza' }));
        const dialog = screen.getByRole('dialog', { name: 'Nuova stanza' });
        fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
        expect(dialog).toContainElement(screen.getByRole('button', { name: 'Camera', pressed: true }));
        fireEvent.click(screen.getByRole('button', { name: 'Crea stanza' }));

        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('r_new'));
        expect(createRoom).toHaveBeenCalledWith('p1', { label: 'Camera', room_type: 'camera' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('uses the typed name', async () => {
        createRoom.mockResolvedValue({ room_id: 'r_new', label: 'Bagno ospiti', room_type: 'bagno' });
        renderChips();

        fireEvent.click(screen.getByRole('button', { name: 'Nuova stanza' }));
        fireEvent.change(screen.getByLabelText('Nome (facoltativo)'), { target: { value: '  Bagno ospiti ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crea stanza' }));

        await waitFor(() =>
            expect(createRoom).toHaveBeenCalledWith('p1', { label: 'Bagno ospiti', room_type: 'bagno' }),
        );
    });

    it('keeps the form open with an error when the room is not created', async () => {
        createRoom.mockRejectedValue({ status: 409 });
        const onSelect = renderChips();

        fireEvent.click(screen.getByRole('button', { name: 'Nuova stanza' }));
        fireEvent.click(screen.getByRole('button', { name: 'Crea stanza' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Non è stato possibile creare la stanza');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });
});
