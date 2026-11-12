import { fullAddress, legalLine, mailtoHref, telHref, whatsappHref } from '@/lib/company-info/format';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';

describe('telHref', () => {
    it('keeps the leading + and the digits only', () => {
        expect(telHref('+39 375 5463599')).toBe('tel:+393755463599');
        expect(telHref('06 1234-567')).toBe('tel:061234567');
    });
});

describe('whatsappHref', () => {
    it.each([
        ['+39 375 5463599', 'https://wa.me/393755463599'],
        ['0039 375 5463599', 'https://wa.me/393755463599'],
        ['375 5463599', 'https://wa.me/393755463599'],
    ])('turns %s into %s', (number, href) => {
        expect(whatsappHref(number)).toBe(href);
    });
});

describe('mailtoHref', () => {
    it('is the plain mailto link', () => {
        expect(mailtoHref('info@esempio.it')).toBe('mailto:info@esempio.it');
    });
});

describe('legal lines', () => {
    it('writes the legal line and the full address of the identity', () => {
        const { identity } = SEED_COMPANY_INFO;
        expect(legalLine(identity)).toBe('SYD Bioedilizia S.r.l. - P.IVA 15714991005');
        expect(fullAddress(identity)).toBe('Via Quero, 132 - 00123 Roma (RM)');
    });
});
