import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilePreviewItem } from '../FilePreviewItem';
import type { UploadItem } from '@/types/media';

jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

function item(overrides: Partial<UploadItem> = {}): UploadItem {
    return {
        id: 'u1',
        file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
        previewUrl: 'blob:preview',
        progress: 0,
        status: 'error',
        ...overrides,
    };
}

describe('FilePreviewItem — failed upload', () => {
    it('shows a short label that fits the thumbnail, with the full reason on hover', () => {
        const reason = 'Hai raggiunto il limite giornaliero di caricamenti video. Riprova domani dopo le 09:10.';
        render(<FilePreviewItem item={item({ error: reason })} onRemove={jest.fn()} onRetry={jest.fn()} />);

        // The long reason is shown by ChatInput; a 10px label inside an 80px
        // thumbnail would clip it.
        const label = screen.getByText('Non riuscito');
        expect(label).toHaveAttribute('title', reason);
        expect(screen.queryByText(reason)).not.toBeInTheDocument();
    });

    it('offers a retry when trying again can help', async () => {
        const onRetry = jest.fn();
        render(<FilePreviewItem item={item({ error: 'Rete assente', retryable: true })} onRemove={jest.fn()} onRetry={onRetry} />);

        await userEvent.click(screen.getByRole('button', { name: /riprova/i }));

        expect(onRetry).toHaveBeenCalledWith('u1');
    });

    it('offers a retry by default, when the failure carries no hint', () => {
        render(<FilePreviewItem item={item({ error: 'boh' })} onRemove={jest.fn()} onRetry={jest.fn()} />);

        expect(screen.getByRole('button', { name: /riprova/i })).toBeInTheDocument();
    });

    it('hides the retry button when retrying cannot help (quota used up)', () => {
        render(
            <FilePreviewItem item={item({ error: 'Limite raggiunto', retryable: false })} onRemove={jest.fn()} onRetry={jest.fn()} />
        );

        expect(screen.queryByRole('button', { name: /riprova/i })).not.toBeInTheDocument();
        expect(screen.getByText('Non riuscito')).toBeInTheDocument();
    });

    it('shows the label for a failure without any text', () => {
        render(<FilePreviewItem item={item({ error: undefined })} onRemove={jest.fn()} />);

        expect(screen.getByText('Non riuscito')).not.toHaveAttribute('title');
    });

    it('shows no failure label for a healthy upload', () => {
        render(<FilePreviewItem item={item({ status: 'success', progress: 100 })} onRemove={jest.fn()} />);

        expect(screen.queryByText('Non riuscito')).not.toBeInTheDocument();
    });
});
