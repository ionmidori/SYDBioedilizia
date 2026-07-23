import { fetchWithAuth } from '@/lib/api-client';
import { statsApi } from '../stats-api';

jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: jest.fn(),
}));

const mockFetchWithAuth = fetchWithAuth as jest.Mock;

function res(body: unknown, ok = true) {
    return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => mockFetchWithAuth.mockReset());

describe('statsApi.getStats', () => {
    it('returns the stats and revives activity timestamps into Dates', async () => {
        mockFetchWithAuth.mockResolvedValue(
            res({
                activeProjects: 3,
                totalFiles: 10,
                totalRenders: 4,
                recentActivity: [
                    {
                        id: 'act-1',
                        type: 'render_generated',
                        projectName: 'Casa',
                        fileName: 'render.png',
                        timestamp: '2026-07-01T10:00:00Z',
                    },
                ],
            })
        );

        const stats = await statsApi.getStats();

        expect(stats.activeProjects).toBe(3);
        expect(stats.recentActivity[0].timestamp).toBeInstanceOf(Date);
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/reports/dashboard')
        );
    });

    it('throws the Italian message on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, false));
        await expect(statsApi.getStats()).rejects.toThrow('Impossibile caricare le statistiche');
    });
});
