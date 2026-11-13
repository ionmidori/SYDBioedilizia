import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { confirmationsApi } from '@/lib/confirmations-api';
import type { ConfirmationUpdate } from '@/types/confirmation';
import { HOUSE_QUOTE_QUERY_KEY } from './use-house-quote';

/** Prefix of the card queries: invalidate it when the specs may have changed. */
export const CONFIRMATIONS_QUERY_KEY = ['confirmations'] as const;

/** The confirmation card of a project: `null` project, nothing asked. */
export function useConfirmations(projectId: string | null) {
  return useQuery({
    queryKey: [...CONFIRMATIONS_QUERY_KEY, projectId],
    queryFn: () => confirmationsApi.getState(projectId!),
    enabled: projectId !== null,
    staleTime: 30 * 1000,
    // The agent changes the specs during a chat turn: the card reads them again when the client comes back.
    refetchOnWindowFocus: true,
  });
}

/**
 * Confirms one section. The backend recomputes the draft from the confirmed values:
 * the card and the quote of the house are read again.
 */
export function useConfirmationMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionKey, update }: { sectionKey: string; update: ConfirmationUpdate }) =>
      confirmationsApi.confirm(projectId, sectionKey, update),
    // Returned: the mutation stays pending until the card is read again, so the section just
    // confirmed cannot be confirmed twice while it is still on screen.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [...CONFIRMATIONS_QUERY_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: HOUSE_QUOTE_QUERY_KEY }),
      ]),
  });
}

/** Reads the card again (after a chat turn: the agent may have changed the specs or the proposals). */
export function useRefreshConfirmations() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: CONFIRMATIONS_QUERY_KEY }), [queryClient]);
}
