import {
  getTestimonials,
  resetServerTestimonialsMemory,
  TESTIMONIALS_REVALIDATE_SECONDS,
  type PublicTestimonial,
} from '@/lib/testimonials/server';

jest.mock('@/lib/portfolio/runtime', () => ({ isBrowser: () => false }));

function makeTestimonial(overrides: Partial<PublicTestimonial> = {}): PublicTestimonial {
  return {
    id: 't1',
    name: 'Elena Conti',
    location: 'Roma (Monteverde)',
    text: 'Ristrutturazione precisa e tempi rispettati.',
    rating: 5,
    ...overrides,
  };
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  resetServerTestimonialsMemory();
});
afterEach(() => errorSpy.mockRestore());

describe('getTestimonials (server)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches approved testimonials from backend cached for ISR interval', async () => {
    const items = [makeTestimonial()];
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => items });

    await expect(getTestimonials()).resolves.toEqual(items);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/content\/testimonials$/),
      expect.objectContaining({ next: { revalidate: TESTIMONIALS_REVALIDATE_SECONDS } }),
    );
  });

  it('never throws when backend is down: returns [] first, then lastGood', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(getTestimonials()).resolves.toEqual([]);

    const items = [makeTestimonial()];
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => items });
    await getTestimonials();

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(getTestimonials()).resolves.toEqual(items);
  });
});
