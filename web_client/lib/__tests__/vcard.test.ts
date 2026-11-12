import { buildVCard, VCARD_HEADERS, VCARD_PATH } from '@/lib/company-info/vcard';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { SITE_URL } from '@/lib/site';
import type { Identity } from '@/types/company-info';

const { identity } = SEED_COMPANY_INFO;
const lines = (vcard: string) => vcard.split('\r\n');
const unfold = (vcard: string) => vcard.replace(/\r\n /g, '');
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('buildVCard', () => {
    const vcard = buildVCard(identity, SITE_URL);

    it('is a vCard 3.0 closed by CRLF', () => {
        expect(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
        expect(vcard.endsWith('END:VCARD\r\n')).toBe(true);
        expect(vcard).not.toMatch(/[^\r]\n/);
    });

    it('carries the name, phone, email, address and site of the company info', () => {
        const card = lines(vcard);
        expect(card).toContain(`FN:${identity.name}`);
        expect(card).toContain(`N:${identity.name};;;;`);
        expect(card).toContain(`ORG:${identity.legal_name}`);
        expect(card).toContain('TEL;TYPE=WORK,VOICE:+393755463599');
        expect(card).toContain(`EMAIL;TYPE=INTERNET:${identity.email}`);
        expect(card).toContain('ADR;TYPE=WORK:;;Via Quero\\, 132;Roma;RM;00123;IT');
        expect(card).toContain(`URL:${SITE_URL}`);
    });

    it('has no second number when WhatsApp is the same number as the phone', () => {
        expect(vcard).not.toContain('TYPE=CELL');
    });

    it('adds the WhatsApp number when it is a different one, and none without it', () => {
        const other: Identity = { ...identity, whatsapp: '+39 333 1112223' };
        expect(lines(buildVCard(other, SITE_URL))).toContain('TEL;TYPE=CELL:+393331112223');
        expect(buildVCard({ ...identity, whatsapp: null }, SITE_URL)).not.toContain('TYPE=CELL');
    });

    it('escapes backslash, comma, semicolon and newline in the values', () => {
        const card = buildVCard({ ...identity, legal_name: 'A; B, C\\D', name: 'Riga\nDue' }, SITE_URL);
        expect(lines(card)).toContain('ORG:A\\; B\\, C\\\\D');
        expect(lines(card)).toContain('FN:Riga\\nDue');
    });

    it('folds long lines at 75 bytes without losing or splitting a character', () => {
        const street = 'Via dell’Àquila è città '.repeat(8).trim();
        const card = buildVCard({ ...identity, address: { ...identity.address, street } }, SITE_URL);
        for (const line of lines(card)) expect(bytes(line)).toBeLessThanOrEqual(75);
        expect(lines(card).some((line) => line.startsWith(' '))).toBe(true);
        expect(unfold(card)).toContain(`ADR;TYPE=WORK:;;${street};Roma;RM;00123;IT`);
    });
});

describe('the vCard route contract', () => {
    it('is a downloadable text/vcard file', () => {
        expect(VCARD_PATH).toBe('/syd-bioedilizia.vcf');
        expect(VCARD_HEADERS['Content-Type']).toBe('text/vcard; charset=utf-8');
        expect(VCARD_HEADERS['Content-Disposition']).toBe('attachment; filename="syd-bioedilizia.vcf"');
    });
});
