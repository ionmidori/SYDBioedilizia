import { statsApi } from '@/lib/stats-api';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardStats } from '../useDashboardStats';

type MockUser = { uid: string } | null;
let mockUser: MockUser = null;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/lib/stats-api', () => ({
    statsApi: { getStats: jest.fn() },
}));

const mockGetStats = statsApi.getStats as jest.Mock;

beforeEach(() => {
    mockUser = null;
    mockGetStats.mockReset();
});

describe('useDashboardStats', () => {
    it('does not fetch while signed out and keeps the zeroed defaults', () => {
        const { result } = renderHook(() => useDashboardStats());

        expect(mockGetStats).not.toHaveBeenCalled();
        expect(result.current.stats.activeProjects).toBe(0);
        expect(result.current.loading).toBe(true); // stays in skeleton state
    });

    it('loads the stats once a user is present', async () => {
        mockUser = { uid: 'u1' };
        const stats = {
            activeProjects: 2,
            totalFiles: 5,
            totalRenders: 1,
            recentActivity: [],
        };
        mockGetStats.mockResolvedValue(stats);

        const { result } = renderHook(() => useDashboardStats());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.stats).toEqual(stats);
        expect(result.current.error).toBeNull();
    });

    it('sets the Italian error message when the API fails', async () => {
        mockUser = { uid: 'u1' };
        mockGetStats.mockRejectedValue(new Error('boom'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useDashboardStats());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('Impossibile caricare le statistiche');
        errorSpy.mockRestore();
    });
});
