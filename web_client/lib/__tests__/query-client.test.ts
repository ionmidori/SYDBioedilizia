import { queryClient } from '../query-client';

type RetryFn = (failureCount: number, error: unknown) => boolean;

describe('queryClient retry policy', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry as RetryFn;

    it('is a function, not a count', () => {
        expect(typeof retry).toBe('function');
    });

    it.each([400, 401, 403, 404, 422, 499])('never retries a %i (4xx)', (status) => {
        expect(retry(0, { status })).toBe(false);
    });

    it('retries a 5xx once', () => {
        expect(retry(0, { status: 500 })).toBe(true);
        expect(retry(1, { status: 500 })).toBe(false);
    });

    it('retries a status-less error (network failure) once', () => {
        expect(retry(0, new Error('offline'))).toBe(true);
        expect(retry(1, new Error('offline'))).toBe(false);
    });
});

describe('queryClient cache defaults', () => {
    it('keeps the security-relevant cache windows', () => {
        const queries = queryClient.getDefaultOptions().queries;
        expect(queries?.staleTime).toBe(5 * 60 * 1000);
        expect(queries?.gcTime).toBe(10 * 60 * 1000);
        expect(queries?.refetchOnWindowFocus).toBe(false);
    });
});
