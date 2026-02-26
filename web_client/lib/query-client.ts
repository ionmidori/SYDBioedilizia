import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient instance.
 *
 * Exported so that code outside the React tree (e.g. AuthProvider.logout)
 * can call queryClient.clear() without needing useQueryClient(), which
 * requires being inside a QueryClientProvider subtree.
 *
 * Security: clearing the cache on logout prevents cross-user data leakage
 * on shared/kiosk devices where multiple users share the same browser tab.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60 * 1000,      // 1 minute
            gcTime: 5 * 60 * 1000,     // 5 minutes
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
                // Never retry on 4xx — auth errors won't resolve on retry
                // and timing-based enumeration is mitigated
                const status = (error as { status?: number })?.status;
                if (status !== undefined && status >= 400 && status < 500) return false;
                return failureCount < 1;
            },
        },
    },
});
