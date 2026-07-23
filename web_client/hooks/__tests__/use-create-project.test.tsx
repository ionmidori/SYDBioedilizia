import { projectsApi } from '@/lib/projects-api';
import { createQueryWrapper } from '@/test-utils/query';
import { renderHook, waitFor } from '@testing-library/react';
import { useCreateProject } from '../use-create-project';
import { PROJECTS_QUERY_KEY } from '../use-projects';

jest.mock('@/lib/projects-api', () => ({
    projectsApi: { createProject: jest.fn() },
}));

const mockCreateProject = projectsApi.createProject as jest.Mock;

beforeEach(() => mockCreateProject.mockReset());

describe('useCreateProject', () => {
    it('creates the project and invalidates the list', async () => {
        mockCreateProject.mockResolvedValue({ session_id: 'new-1' });
        const { wrapper, queryClient } = createQueryWrapper();
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useCreateProject(), { wrapper });
        result.current.mutate({ title: 'Bagno' });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockCreateProject).toHaveBeenCalledWith({ title: 'Bagno' });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROJECTS_QUERY_KEY });
    });

    it('exposes the API error without invalidating', async () => {
        mockCreateProject.mockRejectedValue(new Error('Quota esaurita'));
        const { wrapper, queryClient } = createQueryWrapper();
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useCreateProject(), { wrapper });
        result.current.mutate({});

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toBe('Quota esaurita');
        expect(invalidateSpy).not.toHaveBeenCalled();
    });
});
