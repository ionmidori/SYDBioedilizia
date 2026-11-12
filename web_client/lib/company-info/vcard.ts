/**
 * The company's contact card (vCard 3.0, RFC 2426), built from the company info
 * identity: what "Salva il contatto di SYD" downloads, so the number and the
 * address end up in the phone's address book. Phone, email and address are the
 * ones edited in the admin console.
 */
import type { Identity } from '@/types/company-info';
import { telHref, whatsappHref } from './format';

/** Where the site serves the card (app/syd-bioedilizia.vcf/route.ts). */
export const VCARD_PATH = '/syd-bioedilizia.vcf';

export const VCARD_HEADERS = {
    'Content-Type': 'text/vcard; charset=utf-8',
    'Content-Disposition': 'attachment; filename="syd-bioedilizia.vcf"',
} as const;

/** A vCard text value: backslash, comma, semicolon and line breaks are escaped. */
const escapeValue = (value: string): string =>
    value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

const encoder = new TextEncoder();
const MAX_LINE_BYTES = 75;

/**
 * Folds a line longer than 75 bytes (UTF-8): each continuation starts with a
 * space, and a character is never split.
 */
function fold(line: string): string {
    const parts: string[] = [];
    let current = '';
    let size = 0;
    for (const char of line) {
        const width = encoder.encode(char).length;
        // A continuation line spends one byte on its leading space.
        const limit = parts.length === 0 ? MAX_LINE_BYTES : MAX_LINE_BYTES - 1;
        if (size + width > limit) {
            parts.push(current);
            current = '';
            size = 0;
        }
        current += char;
        size += width;
    }
    parts.push(current);
    return parts.join('\r\n ');
}

/** "+393331234567": the number with its country code, digits only. */
const e164 = (number: string): string => `+${whatsappHref(number).replace('https://wa.me/', '')}`;

export function buildVCard(identity: Identity, siteUrl: string): string {
    const { address } = identity;
    const hasOtherWhatsapp = identity.whatsapp != null && e164(identity.whatsapp) !== e164(identity.phone);
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${escapeValue(identity.name)};;;;`,
        `FN:${escapeValue(identity.name)}`,
        `ORG:${escapeValue(identity.legal_name)}`,
        `TEL;TYPE=WORK,VOICE:${telHref(identity.phone).slice('tel:'.length)}`,
        ...(hasOtherWhatsapp && identity.whatsapp ? [`TEL;TYPE=CELL:${e164(identity.whatsapp)}`] : []),
        `EMAIL;TYPE=INTERNET:${escapeValue(identity.email)}`,
        `ADR;TYPE=WORK:;;${[address.street, address.city, address.region, address.postal_code, address.country]
            .map(escapeValue)
            .join(';')}`,
        `URL:${siteUrl}`,
        'END:VCARD',
    ];
    return `${lines.map(fold).join('\r\n')}\r\n`;
}
