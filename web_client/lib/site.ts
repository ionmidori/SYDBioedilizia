/**
 * Site-level constants: the public address and the brand name, used for links,
 * metadata and structured data. They are technical/brand constants, NOT company
 * facts: phone, email, address and the rest come from the company info
 * (lib/company-info), edited from the admin console.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sydbioedilizia.vercel.app').replace(/\/+$/, '');
export const SITE_NAME = 'SYD Bioedilizia';
