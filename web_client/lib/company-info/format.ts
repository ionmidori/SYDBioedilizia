/**
 * Contact formats derived from the company info identity: links and the lines
 * the legal pages print. Pure functions, no company data of their own.
 */
import type { Identity } from '@/types/company-info';

const digitsOf = (value: string): string => value.replace(/\D/g, '');

/** `tel:` link: the leading `+` (if any) and the digits only. */
export function telHref(phone: string): string {
    return `tel:${phone.trim().startsWith('+') ? '+' : ''}${digitsOf(phone)}`;
}

/**
 * `https://wa.me/<number>`: digits with the country code. `+39 …` and `0039 …`
 * carry it already; a national number gets Italy's (39).
 */
export function whatsappHref(number: string): string {
    let digits = digitsOf(number);
    if (!number.trim().startsWith('+')) {
        digits = digits.startsWith('00') ? digits.slice(2) : `39${digits}`;
    }
    return `https://wa.me/${digits}`;
}

export function mailtoHref(email: string): string {
    return `mailto:${email}`;
}

/** "SYD Bioedilizia S.r.l. - P.IVA 15714991005", for the legal pages' footer line. */
export function legalLine(identity: Identity): string {
    return `${identity.legal_name} - P.IVA ${identity.vat_id}`;
}

/** "Via Quero, 132 - 00123 Roma (RM)" */
export function fullAddress({ address }: Identity): string {
    return `${address.street} - ${address.postal_code} ${address.city} (${address.region})`;
}
