import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_SECTION_SLUGS,
  companyInfoHistorySchema,
  companyInfoResponseSchema,
  companyInfoSchema,
  nationalPhoneDigits,
  PHONE_MIN_DIGITS,
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

describe('phone and WhatsApp (Golden Sync with Phone in company_info.py)', () => {
  const withPhone = (field: 'phone' | 'whatsapp', value: string | null) => {
    const info = seed();
    info.identity[field] = value;
    return companyInfoSchema.safeParse(info);
  };

  it.each(['phone', 'whatsapp'] as const)('rejects a %s that cannot be dialled', (field) => {
    for (const bad of ['Chiamaci', '+39', '06', '+39 12345', '375-546-3599x', '0039 12345', '1234567890123456']) {
      expect(withPhone(field, bad).success).toBe(false);
    }
  });

  it.each(['phone', 'whatsapp'] as const)('accepts a dialable %s', (field) => {
    for (const ok of ['06 123456', '+39 375 5463599', '0039 375 5463599', '(06) 123.456', '06/1234-567']) {
      expect(withPhone(field, ok).success).toBe(true);
    }
  });

  it('lets WhatsApp be null or missing', () => {
    expect(withPhone('whatsapp', null).success).toBe(true);
  });

  it('counts the national digits like the chat does', () => {
    expect(PHONE_MIN_DIGITS).toBe(6);
    expect(nationalPhoneDigits('+39 375 5463599')).toBe('3755463599');
    expect(nationalPhoneDigits('0039 06 12')).toBe('0612');
    expect(nationalPhoneDigits('39 375 5463599')).toBe('393755463599');
  });
});
