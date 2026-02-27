import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { PROJECTS_QUERY_KEY } from './use-projects';
import { ProjectListItem } from '@/types/projects';

export function useDeleteProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: projectsApi.deleteProject,
        onMutate: async (sessionId: string) => {
            // Cancel any outgoing refetches so they don't overwrite our optimistic update
            await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY });

            // Snapshot the previous value
            const previousProjects = queryClient.getQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY);

            // Optimistically remove the project
            if (previousProjects) {
                queryClient.setQueryData<ProjectListItem[]>(
                    PROJECTS_QUERY_KEY,
                    previousProjects.filter((p) => p.session_id !== sessionId)
                );
            }

            // Return a context object with the snapshotted value
            return { previousProjects };
        },
        onError: (err, newProject, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousProjects) {
                queryClient.setQueryData(PROJECTS_QUERY_KEY, context.previousProjects);
            }
        },
        onSettled: () => {
            // Always refetch after error or success to ensure data is synced
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
        },
    });
}
