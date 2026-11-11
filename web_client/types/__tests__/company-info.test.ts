import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_SECTION_SLUGS,
  companyInfoHistorySchema,
  companyInfoResponseSchema,
  companyInfoSchema,
  publicCompanyInfoSchema,
  putCompanyInfoBodySchema,
} from '../company-info';

const SEED_PATH = path.join(__dirname, '../../../backend_python/src/data/company_info.seed.json');

function seed() {
  return JSON.parse(readFileSync(SEED_PATH, 'utf8')).info;
}

describe('company info schemas (Golden Sync with company_info.py)', () => {
  it('parses the backend seed unchanged', () => {
    const info = seed();
    expect(companyInfoSchema.parse(info)).toEqual(info);
  });

  it('lists the same builtin sections as the seed', () => {
    const slugs = seed().sections.filter((s: { builtin: boolean }) => s.builtin).map((s: { slug: string }) => s.slug);
    expect(slugs).toEqual([...BUILTIN_SECTION_SLUGS]);
  });

  it('rejects a missing builtin section', () => {
    const info = seed();
    info.sections = info.sections.filter((s: { slug: string }) => s.slug !== 'garanzie');
    expect(companyInfoSchema.safeParse(info).success).toBe(false);
  });

  it('rejects a section marked builtin that is not one', () => {
    const info = seed();
    info.sections.push({ slug: 'nuova', title: 'Nuova', blocks: [], builtin: true });
    expect(companyInfoSchema.safeParse(info).success).toBe(false);
  });

  it('rejects an FAQ pointing to an unknown section or category', () => {
    const info = seed();
    info.faq[0].section_slug = 'inesistente';
    expect(companyInfoSchema.safeParse(info).success).toBe(false);

    const other = seed();
    other.faq[0].category = 'Inesistente';
    expect(companyInfoSchema.safeParse(other).success).toBe(false);
  });

  it('rejects duplicate places whatever the case', () => {
    const info = seed();
    info.service_area.places.push('roma');
    expect(companyInfoSchema.safeParse(info).success).toBe(false);
  });

  it('rejects closing before opening', () => {
    const info = seed();
    info.hours = [{ days: 'Lun-Ven', opens: '18:00', closes: '09:00' }];
    expect(companyInfoSchema.safeParse(info).success).toBe(false);
    info.hours = [{ days: 'Lun-Ven', opens: '09:00', closes: '18:00' }];
    expect(companyInfoSchema.safeParse(info).success).toBe(true);
  });

  it('rejects an unknown block type or field', () => {
    const info = seed();
    info.site_visit = [{ type: 'html', text: '<b>x</b>' }];
    expect(companyInfoSchema.safeParse(info).success).toBe(false);

    const other = seed();
    other.identity.fax = '06 123';
    expect(companyInfoSchema.safeParse(other).success).toBe(false);
  });

  it('parses the API envelopes', () => {
    const info = seed();
    expect(
      companyInfoResponseSchema.parse({ etag: '"v0"', version: 0, source: 'seed', ignored_document: null, info }).version,
    ).toBe(0);
    expect(publicCompanyInfoSchema.parse({ version: 3, updated_at: '2026-11-11T10:00:00Z', info }).version).toBe(3);
    expect(putCompanyInfoBodySchema.safeParse({ info, reason: 'Orari', extra: 1 }).success).toBe(false);
    expect(
      companyInfoHistorySchema.parse({
        items: [{ version: 2, actor_uid: 'a', reason: null, changed_parts: ['hours'], created_at: '2026-11-11T10:00:00Z' }],
      }).items[0].changed_parts,
    ).toEqual(['hours']);
  });
});
