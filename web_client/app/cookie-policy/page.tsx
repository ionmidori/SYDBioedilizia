import type { Metadata } from 'next';
import { CookiePolicyClient } from '@/components/legal/CookiePolicyClient';
import { SITE_NAME } from '@/lib/site';
import { shareMetadata } from '@/lib/site-share';

const COOKIE_DESCRIPTION =
    'Cookie Policy di SYD Bioedilizia: categorie di cookie tecnici, analitici e funzionali, gestione del consenso e preferenze tramite browser.';

export const metadata: Metadata = {
    title: 'Cookie Policy',
    description: COOKIE_DESCRIPTION,
    ...shareMetadata(undefined, {
        title: `Cookie Policy | ${SITE_NAME}`,
        description: COOKIE_DESCRIPTION,
        path: '/cookie-policy',
    }),
    alternates: {
        canonical: '/cookie-policy',
    },
};

export default function CookiePolicyPage() {
    return <CookiePolicyClient />;
}
