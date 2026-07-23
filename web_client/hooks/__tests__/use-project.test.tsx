import { projectsApi } from '@/lib/projects-api';
import { createQueryWrapper } from '@/test-utils/query';
import { renderHook, waitFor } from '@testing-library/react';
import { useProject } from '../use-project';

jest.mock('@/lib/projects-api', () => ({
    projectsApi: { getProject: jest.fn() },
}));

const mockGetProject = projectsApi.getProject as jest.Mock;

beforeEach(() => mockGetProject.mockReset());

describe('useProject', () => {
    it('fetches the project by id', async () => {
        const project = { session_id: 's1', title: 'Bagno' };
        mockGetProject.mockResolvedValue(project);

        const { result } = renderHook(() => useProject('s1'), {
            wrapper: createQueryWrapper().wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(project);
        expect(mockGetProject).toHaveBeenCalledWith('s1');
    });

    it('stays idle for an empty id', () => {
        const { result } = renderHook(() => useProject(''), {
            wrapper: createQueryWrapper().wrapper,
        });

        expect(result.current.fetchStatus).toBe('idle');
        expect(mockGetProject).not.toHaveBeenCalled();
    });

    it('surfaces a null result (project not found)', async () => {
        mockGetProject.mockResolvedValue(null);

        const { result } = renderHook(() => useProject('missing'), {
            wrapper: createQueryWrapper().wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toBeNull();
    });
});
