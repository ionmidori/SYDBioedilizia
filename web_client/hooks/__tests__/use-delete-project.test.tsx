import { projectsApi } from '@/lib/projects-api';
import { createQueryWrapper } from '@/test-utils/query';
import type { ProjectListItem } from '@/types/projects';
import { renderHook, waitFor } from '@testing-library/react';
import { useDeleteProject } from '../use-delete-project';
import { PROJECTS_QUERY_KEY } from '../use-projects';

jest.mock('@/lib/projects-api', () => ({
    projectsApi: { deleteProject: jest.fn() },
}));

const mockDeleteProject = projectsApi.deleteProject as jest.Mock;

const projects = [
    { session_id: 's1', title: 'Bagno' },
    { session_id: 's2', title: 'Cucina' },
] as ProjectListItem[];

beforeEach(() => mockDeleteProject.mockReset());

describe('useDeleteProject', () => {
    it('optimistically removes the project, then invalidates', async () => {
        mockDeleteProject.mockResolvedValue(undefined);
        const { wrapper, queryClient } = createQueryWrapper();
        queryClient.setQueryData(PROJECTS_QUERY_KEY, projects);
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useDeleteProject(), { wrapper });
        result.current.mutate('s1');

        // The optimistic removal happens before the API resolves
        await waitFor(() =>
            expect(queryClient.getQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY)).toHaveLength(1)
        );
        expect(
            queryClient.getQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY)?.[0].session_id
        ).toBe('s2');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROJECTS_QUERY_KEY });
    });

    it('rolls the list back when the deletion fails', async () => {
        mockDeleteProject.mockRejectedValue(new Error('boom'));
        const { wrapper, queryClient } = createQueryWrapper();
        queryClient.setQueryData(PROJECTS_QUERY_KEY, projects);

        const { result } = renderHook(() => useDeleteProject(), { wrapper });
        result.current.mutate('s1');

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(queryClient.getQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY)).toEqual(projects);
    });

    it('works without a primed cache (no optimistic snapshot)', async () => {
        mockDeleteProject.mockResolvedValue(undefined);
        const { wrapper } = createQueryWrapper();

        const { result } = renderHook(() => useDeleteProject(), { wrapper });
        result.current.mutate('s1');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockDeleteProject.mock.calls[0][0]).toBe('s1');
    });
});
