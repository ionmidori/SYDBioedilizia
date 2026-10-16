import { render, screen } from '@testing-library/react';
import { UploadErrorNotice } from '../UploadErrorNotice';
import type { UploadItem } from '@/types/media';

function item(id: string, overrides: Partial<UploadItem> = {}): UploadItem {
    return {
        id,
        file: new File(['x'], `${id}.png`, { type: 'image/png' }),
        previewUrl: `blob:${id}`,
        progress: 0,
        status: 'error',
        ...overrides,
    };
}

describe('UploadErrorNotice', () => {
    it('renders nothing when no upload failed', () => {
        const { container } = render(
            <UploadErrorNotice items={[item('a', { status: 'success' }), item('b', { status: 'uploading' })]} />
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('shows the full reason of a failed upload as an alert', () => {
        const reason = 'Hai raggiunto il limite giornaliero di caricamenti foto. Riprova domani dopo le 09:10.';
        render(<UploadErrorNotice items={[item('a', { error: reason })]} />);

        expect(screen.getByRole('alert')).toHaveTextContent(reason);
    });

    it('lists a repeated reason only once (three photos over the same quota)', () => {
        const reason = 'Limite raggiunto. Riprova domani.';
        render(
            <UploadErrorNotice
                items={[item('a', { error: reason }), item('b', { error: reason }), item('c', { error: reason })]}
            />
        );

        expect(screen.getAllByText(reason)).toHaveLength(1);
    });

    it('lists different reasons separately and ignores failures without text', () => {
        render(
            <UploadErrorNotice
                items={[item('a', { error: 'Il file è troppo grande.' }), item('b', { error: 'Rete assente' }), item('c', { error: undefined })]}
            />
        );

        expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
            'Il file è troppo grande.',
            'Rete assente',
        ]);
    });
});
