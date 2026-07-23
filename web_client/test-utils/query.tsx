/**
 * Shared TanStack Query test harness.
 *
 * Lives outside __tests__/ on purpose: jest's testMatch treats every file in a
 * __tests__ directory as a suite, and this file has no tests. Not collected
 * for coverage either (collectCoverageFrom spans hooks/, components/, lib/).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Fresh QueryClient per test — no retries, no gc surprises — plus the wrapper
 * to pass to renderHook. The client is returned so tests can seed or inspect
 * the cache (optimistic updates, invalidations).
 */
export function createQueryWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false },
        },
    });

    function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    return { wrapper: Wrapper, queryClient };
}
