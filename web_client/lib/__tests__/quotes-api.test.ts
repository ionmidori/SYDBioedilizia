import { fetchValidated, fetchWithAuth } from '@/lib/api-client';
import { quoteListResponseSchema, quotePdfUrlSchema, quoteSubmitResponseSchema } from '@/types/quote';
import { quotesApi } from '../quotes-api';

jest.mock('@/lib/api-client', () => ({
    fetchValidated: jest.fn(),
    fetchWithAuth: jest.fn(),
    describeApiError: (error: { message?: string }) => error?.message ?? 'Errore',
}));

const mockFetchValidated = fetchValidated as jest.Mock;
const mockFetchWithAuth = fetchWithAuth as jest.Mock;

function res(status: number, body: unknown) {
    return { ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => {
    mockFetchValidated.mockReset();
    mockFetchWithAuth.mockReset();
});

describe('quotesApi.getQuote (the quote of the house)', () => {
    const DRAFT = { project_id: 'chat-1', user_id: 'u1', status: 'draft', items: [] };

    it('returns the validated quote', async () => {
        mockFetchWithAuth.mockResolvedValue(res(200, DRAFT));

        await expect(quotesApi.getQuote('chat-1')).resolves.toMatchObject({ project_id: 'chat-1', status: 'draft' });
        expect(mockFetchWithAuth.mock.calls[0][0]).toMatch(/\/quote\/chat-1$/);
    });

    it('is null while the house has no quote (404)', async () => {
        mockFetchWithAuth.mockResolvedValue(res(404, { detail: "No quote found for project 'chat-1'." }));

        await expect(quotesApi.getQuote('chat-1')).resolves.toBeNull();
    });

    it('throws the backend message on any other failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res(500, { error_code: 'INTERNAL_SERVER_ERROR', message: 'Errore interno' }));

        await expect(quotesApi.getQuote('chat-1')).rejects.toThrow('Errore interno');
    });
});

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
