import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import { ADMIN_KEYS, useApproveQuote, useModerateTestimonial, useSavePriceBook } from '../use-admin';
import { adminApi } from '@/lib/admin/admin-api';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, isAnonymous: true }) }));
jest.mock('@/lib/admin/admin-api', () => ({
  ...jest.requireActual('@/lib/admin/admin-api'),
  adminApi: { approve: jest.fn(), moderateTestimonial: jest.fn(), savePriceBook: jest.fn() },
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

const invalidatedKeys = (spy: jest.SpyInstance) => spy.mock.calls.map(([filters]) => JSON.stringify(filters.queryKey));

describe('cache refresh after writes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a quote decision also refreshes the batch screens and the dashboard', async () => {
    (adminApi.approve as jest.Mock).mockResolvedValue({});
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useApproveQuote('p1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('"v2"');
    });
    const keys = invalidatedKeys(invalidate);
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(ADMIN_KEYS.dossier('p1')),
        JSON.stringify(['admin', 'quotes']),
        JSON.stringify(['admin', 'batch']),
        JSON.stringify(['admin', 'batches']),
        JSON.stringify(ADMIN_KEYS.kpis),
      ]),
    );
  });

  it('a failed decision refreshes too (the screen may be stale)', async () => {
    (adminApi.approve as jest.Mock).mockRejectedValue(new Error('409'));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useApproveQuote('p1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('"v2"').catch(() => undefined);
    });
    expect(invalidatedKeys(invalidate)).toContain(JSON.stringify(['admin', 'batch']));
  });

  it('moderating a review refreshes every list and the dashboard counters', async () => {
    (adminApi.moderateTestimonial as jest.Mock).mockResolvedValue({});
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useModerateTestimonial(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 't1', body: { decision: 'approve' } });
    });
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([JSON.stringify(['admin', 'testimonials']), JSON.stringify(ADMIN_KEYS.kpis)]),
    );
  });

  it('saving the price book refreshes it', async () => {
    (adminApi.savePriceBook as jest.Mock).mockResolvedValue({});
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSavePriceBook(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ etag: '"v1"', body: { items: [] } as never });
    });
    expect(invalidatedKeys(invalidate)).toContain(JSON.stringify(ADMIN_KEYS.priceBook));
  });
});
