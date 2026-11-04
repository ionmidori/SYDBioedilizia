import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GalleryCard } from '../GalleryCard';

const updateMetadata = jest.fn();
let hookError: string | null = null;
jest.mock('@/hooks/useMetadataEditor', () => ({
    useMetadataEditor: () => ({ updateMetadata, isUpdating: false, error: hookError }),
}));
jest.mock('next/image', () => ({
    __esModule: true,
    default: ({ alt }: { alt: string }) => <span data-testid="img">{alt}</span>,
}));

const withPath = {
    url: 'https://signed/a',
    name: 'a.jpg',
    path: 'renders/p1/a.jpg',
    metadata: { room: 'bagno' },
    type: 'image/jpeg',
};
const legacy = { url: 'https://signed/b', name: 'b.jpg', metadata: {}, type: 'image/jpeg' };

beforeEach(() => {
    updateMetadata.mockReset();
    hookError = null;
});

const editButtons = () => screen.queryAllByRole('button', { name: 'Modifica stanza e stato' });

describe('GalleryCard metadata editor', () => {
    it('offers editing only for items that carry their Storage path', () => {
        render(<GalleryCard items={[withPath, legacy]} projectId="p1" />);
        expect(editButtons()).toHaveLength(1);
    });

    it('sends the Storage path (not the file name) and shows the saved room', async () => {
        updateMetadata.mockResolvedValue(true);
        render(<GalleryCard items={[withPath]} projectId="p1" />);

        fireEvent.click(editButtons()[0]);
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'cucina' } });
        fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

        await waitFor(() =>
            expect(updateMetadata).toHaveBeenCalledWith({
                projectId: 'p1',
                filePath: 'renders/p1/a.jpg',
                room: 'cucina',
            })
        );
        // The modal closes (after its exit animation) and the overlay label
        // follows the save without a refetch.
        await waitFor(() => expect(screen.queryAllByRole('combobox')).toHaveLength(0));
        expect(screen.getByText('cucina')).toBeInTheDocument();
        expect(screen.queryByText('bagno')).not.toBeInTheDocument();

        // Reopening the editor prefills the saved value.
        fireEvent.click(editButtons()[0]);
        expect(screen.getAllByRole('combobox')[0]).toHaveValue('cucina');
    });

    it('disables saving when neither room nor status is chosen', () => {
        render(<GalleryCard items={[{ ...withPath, metadata: {} }]} projectId="p1" />);
        fireEvent.click(editButtons()[0]);
        expect(screen.getByRole('button', { name: /Salva/ })).toBeDisabled();
    });

    it('shows the save error', () => {
        hookError = 'Request validation failed.';
        render(<GalleryCard items={[withPath]} projectId="p1" />);
        fireEvent.click(editButtons()[0]);
        expect(screen.getByRole('alert')).toHaveTextContent('Request validation failed.');
    });
});
