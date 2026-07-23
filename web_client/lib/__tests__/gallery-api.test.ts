import { fetchWithAuth } from '@/lib/api-client';
import { galleryApi } from '../gallery-api';

jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: jest.fn(),
}));

const mockFetchWithAuth = fetchWithAuth as jest.Mock;

function res(body: unknown, ok = true) {
    return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

const asset = {
    id: 'a1',
    type: 'image',
    url: 'https://x/a.png',
    title: 'Cucina',
    createdAt: '2026-07-01T10:00:00Z',
    timestamp: '2026-07-01T10:00:00Z',
    metadata: { uploadedBy: 'u1', projectId: 'p1', projectName: 'Casa' },
};

beforeEach(() => mockFetchWithAuth.mockReset());

describe('galleryApi.listAssets', () => {
    it('requests the given page size without a cursor', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ assets: [], hasMore: false }));
        await galleryApi.listAssets(25);
        const url = mockFetchWithAuth.mock.calls[0][0] as string;
        expect(url).toContain('limit=25');
        expect(url).not.toContain('last_id');
    });

    it('appends the pagination cursor when provided', async () => {
        mockFetchWithAuth.mockResolvedValue(res({ assets: [], hasMore: false }));
        await galleryApi.listAssets(50, 'cursor-9');
        expect(mockFetchWithAuth.mock.calls[0][0]).toContain('last_id=cursor-9');
    });

    it('revives ISO strings into Date objects', async () => {
        mockFetchWithAuth.mockResolvedValue(
            res({ assets: [asset], hasMore: true, lastVisibleId: 'a1' })
        );

        const data = await galleryApi.listAssets();

        expect(data.hasMore).toBe(true);
        expect(data.assets[0].createdAt).toBeInstanceOf(Date);
        expect(data.assets[0].timestamp).toBeInstanceOf(Date);
        expect((data.assets[0].createdAt as Date).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    });

    it('throws the Italian message on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, false));
        await expect(galleryApi.listAssets()).rejects.toThrow('Impossibile caricare la galleria');
    });
});
