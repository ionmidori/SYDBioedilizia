import { getCompanyInfo } from '@/lib/company-info/server';
import { buildVCard, VCARD_HEADERS } from '@/lib/company-info/vcard';
import { SITE_URL } from '@/lib/site';

// Route Handlers are not cached unless asked (Next.js docs, "Route Handlers"):
// static, rebuilt at most every 60 s so a console edit reaches the card soon.
export const dynamic = 'force-static';
export const revalidate = 60;

/** The company's contact card, built from the company info (name, phone, email, address). */
export async function GET(): Promise<Response> {
    const { identity } = await getCompanyInfo();
    return new Response(buildVCard(identity, SITE_URL), { headers: VCARD_HEADERS });
}
