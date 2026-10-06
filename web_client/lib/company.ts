/**
 * Company identity data — single source of truth for footer, legal pages
 * (privacy, cookie, terms) and the homepage JSON-LD. Change it here only.
 */
export const COMPANY = {
    name: 'SYD Bioedilizia',
    legalName: 'SYD Bioedilizia S.r.l.',
    vatId: '15714991005',
    address: {
        street: 'Via Quero, 132',
        postalCode: '00123',
        city: 'Roma',
        region: 'RM',
        country: 'IT',
    },
    phone: '+39 375 5463599',
    email: 'sydbioedilizia@gmail.com',
    url: 'https://sydbioedilizia.vercel.app',
} as const;

/** "SYD Bioedilizia S.r.l. - P.IVA 15714991005", for the legal pages' footer line. */
export const COMPANY_LEGAL_LINE = `${COMPANY.legalName} - P.IVA ${COMPANY.vatId}`;

/** "Via Quero, 132 - 00123 Roma (RM)" */
export const COMPANY_FULL_ADDRESS =
    `${COMPANY.address.street} - ${COMPANY.address.postalCode} ${COMPANY.address.city} (${COMPANY.address.region})`;
