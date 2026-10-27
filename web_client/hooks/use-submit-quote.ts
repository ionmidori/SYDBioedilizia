import { useMutation, useQueryClient } from '@tanstack/react-query';
import { quotesApi } from '@/lib/quotes-api';
import { PROJECTS_QUERY_KEY } from './use-projects';
import { QUOTES_QUERY_KEY } from './use-quotes';

/** "Invia al team": the project's quote goes to the team for review. */
export function useSubmitQuote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ projectId, idempotencyKey }: { projectId: string; idempotencyKey: string }) =>
            quotesApi.submitQuote(projectId, idempotencyKey),
        onSuccess: () => {
            // The card shows the new quote status; the "Preventivi" page lists the request.
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY });
        },
    });
}
