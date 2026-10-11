'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { AdminApiError, adminApi, type QuoteListFilters } from '@/lib/admin/admin-api';
import type { EditQuoteBody, QuoteWriteResponse, SendQuoteBody } from '@/types/admin-quote';

export const ADMIN_KEYS = {
  me: ['admin', 'me'] as const,
  quotes: (filters: QuoteListFilters) => ['admin', 'quotes', filters] as const,
  dossier: (projectId: string) => ['admin', 'dossier', projectId] as const,
  revision: (projectId: string, version: number) => ['admin', 'revision', projectId, version] as const,
  sendDefaults: (projectId: string) => ['admin', 'send-defaults', projectId] as const,
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

/** A revision is immutable: fetched once, when the admin opens it. */
export function useAdminRevision(projectId: string, version: number, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_KEYS.revision(projectId, version),
    queryFn: () => adminApi.getRevision(projectId, version),
    enabled,
    staleTime: Infinity,
    retry: retryUnlessDenied,
  });
}

/** What the Send dialog pre-fills. Always fresh: the recipient may have changed. */
export function useSendDefaults(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_KEYS.sendDefaults(projectId),
    queryFn: () => adminApi.sendDefaults(projectId),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: retryUnlessDenied,
  });
}

/**
 * Every write refreshes the dossier (new ETag, status, revisions) and the
 * inbox, success or not (a 409 means the dossier is stale). The refetch is
 * deliberately NOT awaited: the caller clears its local draft as soon as the
 * write resolves, before the new ETag arrives, so a save never looks like a
 * conflict with itself.
 */
function useQuoteWrite<TVariables, TResult>(projectId: string, mutationFn: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.dossier(projectId) });
      void client.invalidateQueries({ queryKey: ['admin', 'quotes'] });
    },
  });
}

export function useClaimQuote(projectId: string) {
  return useQuoteWrite<void, QuoteWriteResponse>(projectId, () => adminApi.claim(projectId));
}

export function useReleaseQuote(projectId: string) {
  return useQuoteWrite<void, QuoteWriteResponse>(projectId, () => adminApi.release(projectId));
}

export function useEditQuote(projectId: string) {
  return useQuoteWrite(projectId, (v: { etag: string; body: EditQuoteBody }) =>
    adminApi.edit(projectId, v.etag, v.body),
  );
}

export function useApproveQuote(projectId: string) {
  return useQuoteWrite(projectId, (etag: string) => adminApi.approve(projectId, etag));
}

export function useRegeneratePdf(projectId: string) {
  return useQuoteWrite<void, QuoteWriteResponse>(projectId, () => adminApi.regeneratePdf(projectId));
}

export function useRejectQuote(projectId: string) {
  return useQuoteWrite(projectId, (reason: string) => adminApi.reject(projectId, reason));
}

export function useReopenQuote(projectId: string) {
  return useQuoteWrite(projectId, (reason: string) => adminApi.reopen(projectId, reason));
}

export function useSendQuote(projectId: string) {
  return useQuoteWrite(projectId, (v: { body: SendQuoteBody; idempotencyKey: string }) =>
    adminApi.send(projectId, v.body, v.idempotencyKey),
  );
}

/** Current time, refreshed every `intervalMs` (keeps lock expiry honest on a page left open). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
