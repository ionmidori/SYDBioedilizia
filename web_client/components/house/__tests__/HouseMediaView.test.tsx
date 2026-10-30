import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { HouseMediaView } from '../HouseMediaView';
import type { MediaAsset } from '@/lib/media-utils';

const asset = (id: string, type: MediaAsset['type'], roomId: string | null): MediaAsset => ({
    id, type, url: `https://cdn/${id}`, title: id, timestamp: new Date(), metadata: { projectId: 'chat-1', roomId },
});

let mockFiles: { assets: MediaAsset[]; loaded: boolean; error: string | null };
jest.mock('@/hooks/useHouseFiles', () => ({ useHouseFiles: () => mockFiles }));
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({
        rooms: [
            { room_id: 'bagno', label: 'Bagno', room_type: 'bagno' },
            { room_id: 'cucina', label: 'Cucina', room_type: 'cucina' },
        ],
        activeRoomId: 'cucina',
    }),
}));
jest.mock('@/components/dashboard/AssetGallery', () => ({
    AssetGallery: ({ assets }: { assets: MediaAsset[] }) => (
        <ul data-testid="gallery">{assets.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
    ),
}));
const MockUploader = jest.fn<React.ReactElement, [{ projectId: string; roomId?: string | null }]>(() => <div data-testid="uploader" />);
jest.mock('@/components/dashboard/FileUploader', () => ({
    FileUploader: (props: { projectId: string; roomId?: string | null }) => MockUploader(props),
}));

const shown = () => screen.getAllByRole('listitem').map((li) => li.textContent);

beforeEach(() => {
    jest.clearAllMocks();
    mockFiles = {
        loaded: true,
        error: null,
        assets: [asset('foto-bagno', 'image', 'bagno'), asset('render-bagno', 'render', 'bagno'),
                 asset('foto-cucina', 'image', 'cucina'), asset('pianta', 'quote', null)],
    };
});

describe('HouseMediaView (the media of the house, by room)', () => {
    it('shows every file, with a filter per room of the house', () => {
        render(<HouseMediaView chatId="chat-1" />);

        expect(shown()).toEqual(['foto-bagno', 'render-bagno', 'foto-cucina', 'pianta']);
        for (const name of ['Tutte le stanze', 'Bagno', 'Cucina', 'Senza stanza']) {
            expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
        }
    });

    it('shows the files of one room', async () => {
        render(<HouseMediaView chatId="chat-1" />);

        await userEvent.click(screen.getByRole('button', { name: /^Bagno/ }));
        expect(shown()).toEqual(['foto-bagno', 'render-bagno']);

        await userEvent.click(screen.getByRole('button', { name: /^Senza stanza/ }));
        expect(shown()).toEqual(['pianta']);
    });

    it('combines the room with the kind of file', async () => {
        render(<HouseMediaView chatId="chat-1" />);

        await userEvent.click(screen.getByRole('button', { name: /^Bagno/ }));
        await userEvent.click(screen.getByRole('button', { name: /^Render/ }));

        expect(shown()).toEqual(['render-bagno']);
    });

    it('files an upload in the room on screen, else in the active room', async () => {
        render(<HouseMediaView chatId="chat-1" />);

        await userEvent.click(screen.getByRole('button', { name: 'Carica file' }));
        expect(MockUploader.mock.calls.at(-1)?.[0]).toMatchObject({ projectId: 'chat-1', roomId: 'cucina' });
        await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

        await userEvent.click(screen.getByRole('button', { name: /^Bagno/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Carica file' }));
        expect(MockUploader.mock.calls.at(-1)?.[0]).toMatchObject({ roomId: 'bagno' });
    });

    it('files an upload from "Senza stanza" in no room', async () => {
        render(<HouseMediaView chatId="chat-1" />);

        await userEvent.click(screen.getByRole('button', { name: /^Senza stanza/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Carica file' }));

        expect(MockUploader.mock.calls.at(-1)?.[0]).toMatchObject({ roomId: null });
    });

    it('counts a file of a room the house no longer has as "Senza stanza"', async () => {
        mockFiles.assets.push(asset('foto-studio', 'image', 'studio'));
        render(<HouseMediaView chatId="chat-1" />);

        expect(screen.getByRole('button', { name: /^Senza stanza/ })).toHaveTextContent('(2)');
        await userEvent.click(screen.getByRole('button', { name: /^Senza stanza/ }));
        expect(shown()).toEqual(['pianta', 'foto-studio']);
    });

    it('says when there is nothing yet', () => {
        mockFiles = { loaded: true, error: null, assets: [] };
        render(<HouseMediaView chatId="chat-1" />);

        expect(screen.getByText(/Nessun file/)).toBeInTheDocument();
    });

    it('shows why the files cannot be read', () => {
        mockFiles = { loaded: true, error: 'Non hai i permessi per vedere i file della tua casa.', assets: [] };
        render(<HouseMediaView chatId="chat-1" />);

        expect(screen.getByRole('alert')).toHaveTextContent('Non hai i permessi');
    });
});
