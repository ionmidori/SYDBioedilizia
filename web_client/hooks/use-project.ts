import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { Project } from '@/types/projects';

export const PROJECT_QUERY_KEY = (id: string) => ['project', id] as const;

export function useProject(id: string) {
  return useQuery<Project | null>({
    queryKey: PROJECT_QUERY_KEY(id),
    queryFn: () => projectsApi.getProject(id),
    enabled: !!id, // Only fetch if ID is present
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
