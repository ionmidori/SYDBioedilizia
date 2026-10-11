import {
  adminBatchDetailSchema,
  adminKpisSchema,
  gdprRunResultSchema,
  moderateBodySchema,
  portfolioPatchSchema,
  portfolioProjectSchema,
  portfolioWriteSchema,
  testimonialListSchema,
} from '../admin-content';

const WRITE = {
  title: 'Bagno Trastevere',
  category: 'Bagno',
  location: 'Roma',
  image_url: 'https://firebasestorage.googleapis.com/v0/b/b/o/portfolio%2Fx.webp?alt=media',
};

describe('admin content schemas (Golden Sync with admin_content.py)', () => {
  it('fills the defaults of a new portfolio project like the backend', () => {
    const parsed = portfolioWriteSchema.parse(WRITE);
    expect(parsed).toMatchObject({ active: true, description: '', stats: { area: '', duration: '', budget: '' } });
  });

  it.each([
    ['an unknown category', { category: 'Giardino' }],
    ['a blank title', { title: '   ' }],
    ['an unknown field', { surprise: 1 }],
    ['no image', { image_url: '' }],
  ])('rejects %s', (_label, patch) => {
    expect(portfolioWriteSchema.safeParse({ ...WRITE, ...patch }).success).toBe(false);
  });

  it('a patch must change something and may change one field', () => {
    expect(portfolioPatchSchema.safeParse({}).success).toBe(false);
    expect(portfolioPatchSchema.parse({ active: false })).toEqual({ active: false });
    expect(portfolioPatchSchema.safeParse({ order: 0 }).success).toBe(false);
  });

  it('parses a stored project with missing optional fields', () => {
    const parsed = portfolioProjectSchema.parse({ id: 'p1', title: 'T', category: 'Bagno', location: 'Roma' });
    expect(parsed).toMatchObject({ active: true, order: 0, description: '' });
    expect(parsed.image_url).toBeUndefined();
  });

  it('moderation takes approve or reject only', () => {
    expect(moderateBodySchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(moderateBodySchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });

  it('parses the testimonial list with its stats', () => {
    const parsed = testimonialListSchema.parse({
      items: [{ id: 't1', name: 'Anna', text: 'Ottimo', status: 'pending' }],
      stats: { pending: 1 },
    });
    expect(parsed.stats).toEqual({ pending: 1, approved: 0, rejected: 0 });
    expect(parsed.items[0].rating).toBe(5);
  });

  it('parses a batch detail with the live quote state of each project', () => {
    const parsed = adminBatchDetailSchema.parse({
      batch_id: 'b1',
      status: 'submitted',
      projects: [{ project_id: 'p1', project_name: 'Bagno', batch_status: 'draft', quote_status: 'sent' }],
    });
    expect(parsed.projects[0]).toMatchObject({ quote_status: 'sent', delivery_status: 'none' });
  });

  it('parses the KPIs and the GDPR run result', () => {
    expect(
      adminKpisSchema.parse({
        by_status: { pending_review: 2 },
        pending_value: 350.5,
        weekly_approvals: [{ week_start: '2026-10-12', approvals: 1 }],
        recent_approvals: [],
        testimonials: {},
        generated_at: '2026-10-14T12:00:00Z',
      }).pending_truncated,
    ).toBe(false);
    expect(gdprRunResultSchema.parse({ status: 'ok', warned: 1, disabled: 0, anonymized: 0, errors: [] }).warned).toBe(1);
  });
});
