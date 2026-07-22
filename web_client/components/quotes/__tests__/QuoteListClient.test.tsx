import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuoteListClient } from '../QuoteListClient';
import { useQuotes } from '@/hooks/use-quotes';
import { quotesApi } from '@/lib/quotes-api';
import { QuoteListItem } from '@/types/quote';

jest.mock('@/hooks/use-quotes');
jest.mock('@/lib/quotes-api', () => ({
    quotesApi: { getQuotePdfUrl: jest.fn() },
}));
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    },
}));
jest.mock('@/components/ui/ScallopedPageTransition', () => ({
    ScallopedInlineLoader: () => <div data-testid="loader" />,
}));

const mockUseQuotes = useQuotes as jest.MockedFunction<typeof useQuotes>;
const mockGetPdfUrl = quotesApi.getQuotePdfUrl as jest.MockedFunction<typeof quotesApi.getQuotePdfUrl>;

function quote(overrides: Partial<QuoteListItem> = {}): QuoteListItem {
    return {
        project_id: 'p1',
        project_name: 'Bagno',
        status: 'pending_review',
        grand_total: 0,
        item_count: 5,
        updated_at: '2026-07-23T10:00:00',
        pdf_available: false,
        ...overrides,
    };
}

function mockQuotesResult(data: QuoteListItem[], opts: { isLoading?: boolean; isError?: boolean } = {}) {
    mockUseQuotes.mockReturnValue({
        data,
        isLoading: opts.isLoading ?? false,
        isError: opts.isError ?? false,
    } as ReturnType<typeof useQuotes>);
}

describe('QuoteListClient', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows the loader while loading', () => {
        mockQuotesResult([], { isLoading: true });
        render(<QuoteListClient />);
        expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('shows empty state when there are no submitted requests', () => {
        mockQuotesResult([]);
        render(<QuoteListClient />);
        expect(screen.getByText(/Nessuna richiesta di preventivo/i)).toBeInTheDocument();
    });

    it('never renders draft quotes (confidential until submission)', () => {
        mockQuotesResult([quote({ status: 'draft', project_name: 'Bozza Segreta' })]);
        render(<QuoteListClient />);
        expect(screen.queryByText('Bozza Segreta')).not.toBeInTheDocument();
    });

    it('renders a pending request without totals', () => {
        mockQuotesResult([quote()]);
        render(<QuoteListClient />);
        expect(screen.getByText('Bagno')).toBeInTheDocument();
        expect(screen.getByText('In revisione')).toBeInTheDocument();
        expect(screen.queryByText(/€/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Scarica PDF/i)).not.toBeInTheDocument();
    });

    it('renders approved quote with total and PDF download', async () => {
        mockQuotesResult([
            quote({ status: 'approved', grand_total: 1220.5, pdf_available: true }),
        ]);
        mockGetPdfUrl.mockResolvedValue({ pdf_url: 'https://signed.example/q.pdf', expires_in_seconds: 900 });
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

        render(<QuoteListClient />);
        expect(screen.getByText('Approvato')).toBeInTheDocument();
        // formato it-IT: separatori/spazi variano tra ICU — match sul nucleo numerico
        expect(screen.getByText(/220,50/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Scarica PDF/i }));
        await waitFor(() => {
            expect(mockGetPdfUrl).toHaveBeenCalledWith('p1');
            expect(openSpy).toHaveBeenCalledWith(
                'https://signed.example/q.pdf', '_blank', 'noopener,noreferrer'
            );
        });
        openSpy.mockRestore();
    });

    it('shows an error message when the PDF fetch fails', async () => {
        mockQuotesResult([
            quote({ status: 'approved', grand_total: 100, pdf_available: true }),
        ]);
        mockGetPdfUrl.mockRejectedValue(new Error('404'));

        render(<QuoteListClient />);
        fireEvent.click(screen.getByRole('button', { name: /Scarica PDF/i }));
        expect(await screen.findByText(/PDF non disponibile/i)).toBeInTheDocument();
    });
});
