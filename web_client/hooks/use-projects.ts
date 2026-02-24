import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { ProjectListItem } from '@/types/projects';

export const PROJECTS_QUERY_KEY = ['projects'] as const;

export function useProjects() {
  return useQuery<ProjectListItem[]>({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: projectsApi.listProjects,
    staleTime: 60 * 1000, // 1 minute
    retry: 1, // Only retry once
    refetchOnWindowFocus: true, // Refresh when user comes back
  });
}
