import { useQuery } from '@tanstack/react-query';
import { quotesApi } from '@/lib/quotes-api';
import { QuoteListItem } from '@/types/quote';
import { useAuth } from '@/hooks/useAuth';

export const QUOTES_QUERY_KEY = ['quotes'] as const;

export function useQuotes() {
  const { user, isAnonymous } = useAuth();

  // Only fetch quotes for authenticated (non-anonymous) users.
  const isAuthenticated = !!user && !isAnonymous;

  return useQuery<QuoteListItem[]>({
    queryKey: QUOTES_QUERY_KEY,
    queryFn: () => quotesApi.listUserQuotes(user!.uid),
    staleTime: 60 * 1000, // 1 minute
    retry: 1,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated,
  });
}
