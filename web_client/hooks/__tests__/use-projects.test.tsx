import { projectsApi } from '@/lib/projects-api';
import { createQueryWrapper } from '@/test-utils/query';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjects } from '../use-projects';

type MockUser = { uid: string } | null;
let mockUser: MockUser = null;
let mockIsAnonymous = false;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, isAnonymous: mockIsAnonymous }),
}));

jest.mock('@/lib/projects-api', () => ({
    projectsApi: { listProjects: jest.fn() },
}));

const mockListProjects = projectsApi.listProjects as jest.Mock;

beforeEach(() => {
    mockUser = null;
    mockIsAnonymous = false;
    mockListProjects.mockReset();
});

describe('useProjects', () => {
    it('fetches the list for an authenticated user', async () => {
        mockUser = { uid: 'u1' };
        const projects = [{ session_id: 's1' }];
        mockListProjects.mockResolvedValue(projects);

        const { result } = renderHook(() => useProjects(), {
            wrapper: createQueryWrapper().wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(projects);
    });

    it('does not fetch when no user is signed in', () => {
        const { result } = renderHook(() => useProjects(), {
            wrapper: createQueryWrapper().wrapper,
        });

        expect(result.current.fetchStatus).toBe('idle');
        expect(mockListProjects).not.toHaveBeenCalled();
    });

    it('does not fetch for anonymous users (would 401)', () => {
        mockUser = { uid: 'anon' };
        mockIsAnonymous = true;

        const { result } = renderHook(() => useProjects(), {
            wrapper: createQueryWrapper().wrapper,
        });

        expect(result.current.fetchStatus).toBe('idle');
        expect(mockListProjects).not.toHaveBeenCalled();
    });
});
