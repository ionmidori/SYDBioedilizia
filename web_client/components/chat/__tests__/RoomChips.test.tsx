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

    it('renders "Tutte" chip, message counts, and routes clicks to onSelectFilter', () => {
        const onSelect = jest.fn();
        const onSelectFilter = jest.fn();
        const counts = new Map([['r_bagno', 3]]);

        render(
            <RoomChips
                projectId="p1"
                rooms={ROOMS}
                activeRoomId="r_bagno"
                viewFilter="all"
                roomMessageCounts={counts}
                onSelect={onSelect}
                onSelectFilter={onSelectFilter}
            />,
        );

        const tutteBtn = screen.getByRole('button', { name: 'Tutte' });
        expect(tutteBtn).toHaveAttribute('aria-pressed', 'true');
        const bagnoBtn = screen.getByRole('button', {
            name: 'Bagno, 3 messaggi, stanza attiva per i nuovi messaggi',
        });
        expect(bagnoBtn).toHaveAttribute('aria-pressed', 'false');
        expect(bagnoBtn).toHaveTextContent('3');

        fireEvent.click(bagnoBtn);
        expect(onSelectFilter).toHaveBeenCalledWith('r_bagno');
        expect(onSelect).not.toHaveBeenCalled();

        fireEvent.click(tutteBtn);
        expect(onSelectFilter).toHaveBeenCalledWith('all');
    });

    it('supports WCAG 2.2 ArrowRight/ArrowLeft/Home/End keyboard navigation across chips', () => {
        render(
            <RoomChips
                projectId="p1"
                rooms={ROOMS}
                activeRoomId="r_bagno"
                viewFilter="all"
                onSelect={jest.fn()}
                onSelectFilter={jest.fn()}
            />,
        );

        const toolbar = screen.getByRole('toolbar', { name: 'Stanze del progetto' });
        const tutte = screen.getByRole('button', { name: 'Tutte' });
        const cucina = screen.getByRole('button', { name: 'Cucina' });
        const nuova = screen.getByRole('button', { name: 'Nuova stanza' });

        tutte.focus();
        fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(cucina);

        fireEvent.keyDown(toolbar, { key: 'End' });
        expect(document.activeElement).toBe(nuova);

        fireEvent.keyDown(toolbar, { key: 'Home' });
        expect(document.activeElement).toBe(tutte);
    });
});
