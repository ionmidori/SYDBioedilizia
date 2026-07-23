import { projectsApi } from '@/lib/projects-api';
import { createQueryWrapper } from '@/test-utils/query';
import { renderHook, waitFor } from '@testing-library/react';
import { useClaimProject } from '../use-claim-project';
import { PROJECT_QUERY_KEY } from '../use-project';
import { PROJECTS_QUERY_KEY } from '../use-projects';

jest.mock('@/lib/projects-api', () => ({
    projectsApi: { claimProject: jest.fn() },
}));

const mockClaimProject = projectsApi.claimProject as jest.Mock;

beforeEach(() => mockClaimProject.mockReset());

describe('useClaimProject', () => {
    it('claims the session and invalidates list + project', async () => {
        mockClaimProject.mockResolvedValue({ claimed: true });
        const { wrapper, queryClient } = createQueryWrapper();
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useClaimProject(), { wrapper });
        result.current.mutate('s1');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockClaimProject).toHaveBeenCalledWith('s1');
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROJECTS_QUERY_KEY });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROJECT_QUERY_KEY('s1') });
    });

    it('exposes the claim error without invalidating', async () => {
        mockClaimProject.mockRejectedValue(new Error('Già reclamato'));
        const { wrapper, queryClient } = createQueryWrapper();
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useClaimProject(), { wrapper });
        result.current.mutate('s1');

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toBe('Già reclamato');
        expect(invalidateSpy).not.toHaveBeenCalled();
    });
});
