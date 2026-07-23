import { fetchWithAuth } from '@/lib/api-client';
import { usersApi } from '../users-api';

jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: jest.fn(),
}));

const mockFetchWithAuth = fetchWithAuth as jest.Mock;

function res(body: unknown, ok = true) {
    return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => mockFetchWithAuth.mockReset());

describe('usersApi.getPreferences', () => {
    it('returns the preferences payload', async () => {
        const prefs = { notifications: { email: true, quoteReady: false } };
        mockFetchWithAuth.mockResolvedValue(res(prefs));
        await expect(usersApi.getPreferences()).resolves.toEqual(prefs);
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/users/preferences')
        );
    });

    it('throws the Italian message on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, false));
        await expect(usersApi.getPreferences()).rejects.toThrow(
            'Impossibile caricare le preferenze'
        );
    });
});

describe('usersApi.updatePreferences', () => {
    it('PATCHes the partial update', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}));
        await expect(
            usersApi.updatePreferences({ ui: { sidebarCollapsed: true } })
        ).resolves.toBeUndefined();
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
            expect.stringContaining('/users/preferences'),
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ ui: { sidebarCollapsed: true } }),
            })
        );
    });

    it('throws the Italian message on failure', async () => {
        mockFetchWithAuth.mockResolvedValue(res({}, false));
        await expect(usersApi.updatePreferences({})).rejects.toThrow(
            'Impossibile aggiornare le preferenze'
        );
    });
});
