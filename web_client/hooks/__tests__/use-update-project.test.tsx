import { projectsApi } from '@/lib/projects-api';
import { createQueryWrapper } from '@/test-utils/query';
import type { Project, ProjectListItem } from '@/types/projects';
import { renderHook, waitFor } from '@testing-library/react';
import { PROJECT_QUERY_KEY } from '../use-project';
import { PROJECTS_QUERY_KEY } from '../use-projects';
import { useUpdateProject } from '../use-update-project';

jest.mock('@/lib/projects-api', () => ({
    projectsApi: { updateProject: jest.fn() },
}));

const mockUpdateProject = projectsApi.updateProject as jest.Mock;

const list = [
    { session_id: 's1', title: 'Bagno' },
    { session_id: 's2', title: 'Cucina' },
] as ProjectListItem[];
const single = { session_id: 's1', title: 'Bagno' } as Project;

beforeEach(() => mockUpdateProject.mockReset());

describe('useUpdateProject', () => {
    it('optimistically patches both the list and the single-project cache', async () => {
        mockUpdateProject.mockResolvedValue(undefined);
        const { wrapper, queryClient } = createQueryWrapper();
        queryClient.setQueryData(PROJECTS_QUERY_KEY, list);
        queryClient.setQueryData(PROJECT_QUERY_KEY('s1'), single);

        const { result } = renderHook(() => useUpdateProject(), { wrapper });
        result.current.mutate({ id: 's1', data: { title: 'Bagno grande' } });

        await waitFor(() =>
            expect(
                queryClient.getQueryData<Project>(PROJECT_QUERY_KEY('s1'))?.title
            ).toBe('Bagno grande')
        );
        const patched = queryClient.getQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY);
        expect(patched?.find((p) => p.session_id === 's1')?.title).toBe('Bagno grande');
        expect(patched?.find((p) => p.session_id === 's2')?.title).toBe('Cucina');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockUpdateProject).toHaveBeenCalledWith('s1', { title: 'Bagno grande' });
    });

    it('rolls both caches back when the update fails', async () => {
        mockUpdateProject.mockRejectedValue(new Error('boom'));
        const { wrapper, queryClient } = createQueryWrapper();
        queryClient.setQueryData(PROJECTS_QUERY_KEY, list);
        queryClient.setQueryData(PROJECT_QUERY_KEY('s1'), single);

        const { result } = renderHook(() => useUpdateProject(), { wrapper });
        result.current.mutate({ id: 's1', data: { title: 'Bagno grande' } });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(queryClient.getQueryData(PROJECTS_QUERY_KEY)).toEqual(list);
        expect(queryClient.getQueryData(PROJECT_QUERY_KEY('s1'))).toEqual(single);
    });

    it('invalidates both keys after settling', async () => {
        mockUpdateProject.mockResolvedValue(undefined);
        const { wrapper, queryClient } = createQueryWrapper();
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useUpdateProject(), { wrapper });
        result.current.mutate({ id: 's1', data: {} });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROJECTS_QUERY_KEY });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: PROJECT_QUERY_KEY('s1') });
    });
});
