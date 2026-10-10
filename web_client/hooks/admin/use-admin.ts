'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { AdminApiError, adminApi, type QuoteListFilters } from '@/lib/admin/admin-api';

export const ADMIN_KEYS = {
  me: ['admin', 'me'] as const,
  quotes: (filters: QuoteListFilters) => ['admin', 'quotes', filters] as const,
  dossier: (projectId: string) => ['admin', 'dossier', projectId] as const,
};

/** Never retry an access denial: the answer will not change. */
function retryUnlessDenied(failureCount: number, error: unknown): boolean {
  if (error instanceof AdminApiError && (error.isAccessDenied || error.status === 404)) return false;
  return failureCount < 2;
}

export function useAdminMe() {
  const { user, isAnonymous } = useAuth();
  return useQuery({
    queryKey: ADMIN_KEYS.me,
    queryFn: adminApi.me,
    enabled: !!user && !isAnonymous,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessDenied,
  });
}

export function useAdminQuotes(filters: QuoteListFilters) {
  return useInfiniteQuery({
    queryKey: ADMIN_KEYS.quotes(filters),
    queryFn: ({ pageParam }) => adminApi.listQuotes(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: retryUnlessDenied,
  });
}

export function useAdminDossier(projectId: string) {
  return useQuery({
    queryKey: ADMIN_KEYS.dossier(projectId),
    queryFn: () => adminApi.getDossier(projectId),
    staleTime: 15 * 1000,
    retry: retryUnlessDenied,
  });
}
