import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { ProjectCreate } from '@/types/projects';
import { PROJECTS_QUERY_KEY } from './use-projects';

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.createProject(data),
    onSuccess: () => {
      // Invalidate and refetch projects list
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}
