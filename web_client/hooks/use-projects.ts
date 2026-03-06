import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/projects-api';
import { ProjectListItem } from '@/types/projects';
import { useAuth } from '@/hooks/useAuth';

export const PROJECTS_QUERY_KEY = ['projects'] as const;

export function useProjects() {
  const { user, isAnonymous } = useAuth();

  // Only fetch projects for authenticated (non-anonymous) users.
  // Anonymous users have no projects — calling the API would return 401.
  const isAuthenticated = !!user && !isAnonymous;

  return useQuery<ProjectListItem[]>({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: projectsApi.listProjects,
    staleTime: 60 * 1000, // 1 minute
    retry: 1, // Only retry once
    refetchOnWindowFocus: true, // Refresh when user comes back
    enabled: isAuthenticated,
  });
}
