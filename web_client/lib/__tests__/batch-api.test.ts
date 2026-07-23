import { fetchWithAuth } from '@/lib/api-client';
import { batchApi } from '../batch-api';

jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: jest.fn(),
}));

const mockFetchWithAuth = fetchWithAuth as jest.Mock;

function res(body: unknown, init: { ok?: boolean; jsonFails?: boolean } = {}) {
    return {
        ok: init.ok ?? true,
        json: init.jsonFails
            ? () => Promise.reject(new SyntaxError('not json'))
            : () => Promise.resolve(body),
    } as unknown as Response;
}

const batch = { batch_id: 'b1', total_projects: 2, batch_subtotal: 100, status: 'draft' };
const preview = {
    batch_id: 'b1',
    total_savings: 12,
    original_combined_subtotal: 100,
    optimized_subtotal: 88,
    adjustments: [],
};

beforeEach(() => mockFetchWithAuth.mockReset());

describe('batchApi.createBatch', () => {
    it('POSTs the project ids', async () => {
        mockFetchWithAuth.mockResolvedValue(res(batch));
        await expect(batchApi.createBatch(['p1', 'p2'])).resolves.toEqual(batch);
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/quote/batch'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ project_ids: ['p1', 'p2'] }),
            })
        );
    });

    it('surfaces the backend detail on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ detail: 'Troppi progetti' }, { ok: false }));
        await expect(batchApi.createBatch(['p1'])).rejects.toThrow('Troppi progetti');
    });

    it('keeps the generic message when the error body is not JSON', async () => {
        mockFetchWithAuth.mockResolvedValue(res(null, { ok: false, jsonFails: true }));
        await expect(batchApi.createBatch(['p1'])).rejects.toThrow(
            'Errore nella creazione del batch'
        );
    });
});

describe('batchApi.submitBatch', () => {
    it('POSTs to the submit endpoint', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ ...batch, status: 'submitted' }));
        await expect(batchApi.submitBatch('b1')).resolves.toMatchObject({ status: 'submitted' });
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/quote/batch/b1/submit'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('throws the backend detail on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ detail: 'Batch non valido' }, { ok: false }));
        await expect(batchApi.submitBatch('b1')).rejects.toThrow('Batch non valido');
    });
});

describe('batchApi.getBatch / getPreview', () => {
    it('getBatch returns the batch', async () => {
        mockFetchWithAuth.mockResolvedValue(res(batch));
        await expect(batchApi.getBatch('b1')).resolves.toEqual(batch);
    });

    it('getBatch throws on a missing batch', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, { ok: false }));
        await expect(batchApi.getBatch('nope')).rejects.toThrow('Batch non trovato');
    });

    it('getPreview returns the aggregation preview', async () => {
        mockFetchWithAuth.mockResolvedValue(res(preview));
        await expect(batchApi.getPreview('b1')).resolves.toEqual(preview);
    });

    it('getPreview throws when unavailable', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, { ok: false }));
        await expect(batchApi.getPreview('b1')).rejects.toThrow('Preview non disponibile');
    });
});

describe('composed flows', () => {
    it('createWithPreview chains create -> preview', async () => {
        mockFetchWithAuth
            .mockResolvedValueOnce(res(batch))
            .mockResolvedValueOnce(res(preview));

        await expect(batchApi.createWithPreview(['p1'])).resolves.toEqual({ batch, preview });
        expect(mockFetchWithAuth.mock.calls[1][0]).toContain('/quote/batch/b1/preview');
    });

    it('createAndSubmit chains create -> submit', async () => {
        mockFetchWithAuth
            .mockResolvedValueOnce(res(batch))
            .mockResolvedValueOnce(res({ ...batch, status: 'submitted' }));

        await expect(batchApi.createAndSubmit(['p1'])).resolves.toMatchObject({
            status: 'submitted',
        });
        expect(mockFetchWithAuth.mock.calls[1][0]).toContain('/quote/batch/b1/submit');
    });

    it('createAndSubmit stops when creation fails', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ detail: 'no' }, { ok: false }));
        await expect(batchApi.createAndSubmit(['p1'])).rejects.toThrow('no');
        expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    });
});
