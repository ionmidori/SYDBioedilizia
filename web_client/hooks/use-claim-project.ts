import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { PROJECTS_QUERY_KEY } from './use-projects';
import { PROJECT_QUERY_KEY } from './use-project';

export function useClaimProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (sessionId: string) => projectsApi.claimProject(sessionId),
        onSuccess: (_, sessionId) => {
            // Invalidate the projects list so the newly claimed project shows up
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
            // Invalidate the specific project's query so it fetches updated data (e.g., owner info)
            queryClient.invalidateQueries({ queryKey: PROJECT_QUERY_KEY(sessionId) });
        },
    });
}
