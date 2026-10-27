'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { AdminApiError, adminApi, type QuoteListFilters } from '@/lib/admin/admin-api';
import type { EditQuoteBody, QuoteWriteResponse, SendQuoteBody } from '@/types/admin-quote';
import type { ModerateBody, PortfolioPatch, PortfolioWrite, TestimonialStatus } from '@/types/admin-content';
import type { PutPriceBookBody } from '@/types/admin-price-book';

export const ADMIN_KEYS = {
  me: ['admin', 'me'] as const,
  quotes: (filters: QuoteListFilters) => ['admin', 'quotes', filters] as const,
  dossier: (projectId: string) => ['admin', 'dossier', projectId] as const,
  revision: (projectId: string, version: number) => ['admin', 'revision', projectId, version] as const,
  sendDefaults: (projectId: string) => ['admin', 'send-defaults', projectId] as const,
  kpis: ['admin', 'kpis'] as const,
  testimonials: (status: string) => ['admin', 'testimonials', status] as const,
  portfolio: ['admin', 'portfolio'] as const,
  gdpr: ['admin', 'gdpr'] as const,
  priceBook: ['admin', 'price-book'] as const,
  priceBookHistory: ['admin', 'price-book', 'history'] as const,
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
 * inbox and the send defaults, success or not (a 409 means the dossier is
 * stale). The refetch is not awaited here: callers that keep local state
 * (DossierView's draft) hold it until the dossier shows the ETag the write
 * returned, so a save never flashes old values or looks like a conflict.
 */
function useQuoteWrite<TVariables, TResult>(projectId: string, mutationFn: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.dossier(projectId) });
      void client.invalidateQueries({ queryKey: ['admin', 'quotes'] });
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.sendDefaults(projectId) });
      // The dashboard counts the decisions.
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.kpis });
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

export function useAdminKpis() {
  return useQuery({
    queryKey: ADMIN_KEYS.kpis,
    queryFn: adminApi.getKpis,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: retryUnlessDenied,
  });
}

/** The whole price book plus the ETag a save must send back. */
export function usePriceBook(enabled = true) {
  return useQuery({
    queryKey: ADMIN_KEYS.priceBook,
    queryFn: adminApi.getPriceBook,
    enabled,
    staleTime: 15 * 1000,
    retry: retryUnlessDenied,
  });
}

export function usePriceBookHistory(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_KEYS.priceBookHistory,
    queryFn: adminApi.getPriceBookHistory,
    enabled,
    staleTime: 15 * 1000,
    retry: retryUnlessDenied,
  });
}

/** Saving refreshes the book (new ETag) and its history; not awaited, like the quote writes. */
export function useSavePriceBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { etag: string; body: PutPriceBookBody }) => adminApi.savePriceBook(v.etag, v.body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.priceBook });
    },
  });
}

export function useAdminTestimonials(status: TestimonialStatus) {
  return useQuery({
    queryKey: ADMIN_KEYS.testimonials(status),
    queryFn: () => adminApi.listTestimonials(status),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
    retry: retryUnlessDenied,
  });
}

/** Moderation changes the lists of every status and the dashboard counters. */
export function useModerateTestimonial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: ModerateBody }) => adminApi.moderateTestimonial(v.id, v.body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'testimonials'] });
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.kpis });
    },
  });
}

export function useAdminPortfolio() {
  return useQuery({
    queryKey: ADMIN_KEYS.portfolio,
    queryFn: adminApi.listPortfolio,
    staleTime: 15 * 1000,
    retry: retryUnlessDenied,
  });
}

function usePortfolioWrite<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ADMIN_KEYS.portfolio });
    },
  });
}

export function useCreatePortfolioProject() {
  return usePortfolioWrite((body: PortfolioWrite) => adminApi.createPortfolioProject(body));
}

export function useUpdatePortfolioProject() {
  return usePortfolioWrite((v: { id: string; body: PortfolioPatch }) => adminApi.updatePortfolioProject(v.id, v.body));
}

export function useDeletePortfolioProject() {
  return usePortfolioWrite((id: string) => adminApi.deletePortfolioProject(id));
}

/** Uploading only stores a cleaned copy; nothing refers to it until the project is saved. */
export function useUploadPortfolioImage() {
  return useMutation({ mutationFn: (file: File) => adminApi.uploadPortfolioImage(file) });
}

export function useGdprStatus() {
  return useQuery({
    queryKey: ADMIN_KEYS.gdpr,
    queryFn: adminApi.getGdprStatus,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessDenied,
  });
}

export function useRunGdprLifecycle() {
  return useMutation({ mutationFn: () => adminApi.runGdprLifecycle() });
}
