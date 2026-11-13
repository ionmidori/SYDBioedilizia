import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { confirmationsApi } from '@/lib/confirmations-api';
import type { ConfirmationUpdate } from '@/types/confirmation';
import { HOUSE_QUOTE_QUERY_KEY } from './use-house-quote';

const CONFIRMATIONS_QUERY_KEY = ['confirmations'] as const;

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
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...CONFIRMATIONS_QUERY_KEY, projectId],
      });
      queryClient.invalidateQueries({ queryKey: HOUSE_QUOTE_QUERY_KEY });
    },
  });
}
