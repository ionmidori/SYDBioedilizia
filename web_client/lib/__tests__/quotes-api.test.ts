import { fetchValidated } from '@/lib/api-client';
import { quoteListResponseSchema, quotePdfUrlSchema, quoteSubmitResponseSchema } from '@/types/quote';
import { quotesApi } from '../quotes-api';

jest.mock('@/lib/api-client', () => ({
    fetchValidated: jest.fn(),
}));

const mockFetchValidated = fetchValidated as jest.Mock;

beforeEach(() => mockFetchValidated.mockReset());

describe('quotesApi.listUserQuotes', () => {
    it('delegates to fetchValidated with the list schema', async () => {
        mockFetchValidated.mockResolvedValue([]);
        await expect(quotesApi.listUserQuotes('uid-1')).resolves.toEqual([]);
        expect(mockFetchValidated).toHaveBeenCalledWith(
            expect.stringContaining('/quote/user/uid-1'),
            quoteListResponseSchema
        );
    });

    it('URL-encodes the user id', async () => {
        mockFetchValidated.mockResolvedValue([]);
        await quotesApi.listUserQuotes('a/b');
        expect(mockFetchValidated.mock.calls[0][0]).toContain('/quote/user/a%2Fb');
    });
});

describe('quotesApi.getQuotePdfUrl', () => {
    it('delegates to fetchValidated with the pdf-url schema', async () => {
        const payload = { url: 'https://signed/x.pdf' };
        mockFetchValidated.mockResolvedValue(payload);
        await expect(quotesApi.getQuotePdfUrl('proj-1')).resolves.toBe(payload);
        expect(mockFetchValidated).toHaveBeenCalledWith(
            expect.stringContaining('/quote/proj-1/pdf'),
            quotePdfUrlSchema
        );
    });

    it('propagates the 404 thrown before admin approval', async () => {
        mockFetchValidated.mockRejectedValue({ status: 404 });
        await expect(quotesApi.getQuotePdfUrl('proj-1')).rejects.toEqual({ status: 404 });
    });
});

describe('quotesApi.submitQuote', () => {
    it('POSTs to the submit route with the Idempotency-Key', async () => {
        const payload = { project_id: 'p/1', status: 'pending_review', quote_number: null, duplicate: false };
        mockFetchValidated.mockResolvedValue(payload);
        await expect(quotesApi.submitQuote('p/1', 'key-0001')).resolves.toBe(payload);
        expect(mockFetchValidated).toHaveBeenCalledWith(
            expect.stringContaining('/quote/p%2F1/submit'),
            quoteSubmitResponseSchema,
            { method: 'POST', headers: { 'Idempotency-Key': 'key-0001' } }
        );
    });
});
