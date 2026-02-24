import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { ProjectUpdate, Project, ProjectListItem } from '@/types/projects';
import { PROJECTS_QUERY_KEY } from './use-projects';
import { PROJECT_QUERY_KEY } from './use-project';

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectUpdate }) =>
      projectsApi.updateProject(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: PROJECT_QUERY_KEY(id) });

      // Snapshot previous values
      const previousProjects = queryClient.getQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY);
      const previousProject = queryClient.getQueryData<Project>(PROJECT_QUERY_KEY(id));

      // Optimistically update project list
      if (previousProjects) {
        queryClient.setQueryData<ProjectListItem[]>(PROJECTS_QUERY_KEY, (old) =>
          old?.map((p) => (p.session_id === id ? { ...p, ...data } : p)) || []
        );
      }

      // Optimistically update single project
      if (previousProject) {
        queryClient.setQueryData<Project | null>(PROJECT_QUERY_KEY(id), (old) =>
          old ? { ...old, ...data } : null
        );
      }

      return { previousProjects, previousProject };
    },
    onError: (err, { id }, context) => {
      // Rollback
      if (context?.previousProjects) {
        queryClient.setQueryData(PROJECTS_QUERY_KEY, context.previousProjects);
      }
      if (context?.previousProject) {
        queryClient.setQueryData(PROJECT_QUERY_KEY(id), context.previousProject);
      }
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: PROJECT_QUERY_KEY(id) });
    },
  });
}
