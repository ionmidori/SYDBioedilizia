import { useMutation, useQueryClient } from '@tanstack/react-query';
import { quotesApi } from '@/lib/quotes-api';
import { CONFIRMATIONS_QUERY_KEY } from './use-confirmations';
import { HOUSE_QUOTE_QUERY_KEY } from './use-house-quote';
import { QUOTES_QUERY_KEY } from './use-quotes';

/** "Invia al team": the quote of the house goes to the team for review. */
export function useSubmitQuote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ projectId, idempotencyKey }: { projectId: string; idempotencyKey: string }) =>
            quotesApi.submitQuote(projectId, idempotencyKey),
        onSuccess: () => {
            // The house shows the new quote status; the "Preventivi" page lists the request; the
            // chat's summary card turns read-only (the quote is with the team).
            queryClient.invalidateQueries({ queryKey: HOUSE_QUOTE_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: CONFIRMATIONS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
        },
    });
}
