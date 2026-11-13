import type { Metadata } from 'next';
import { PrivacyClient } from '@/components/legal/PrivacyClient';
import { SITE_NAME } from '@/lib/site';
import { shareMetadata } from '@/lib/site-share';

const PRIVACY_DESCRIPTION =
    'Informativa sulla privacy GDPR di SYD Bioedilizia: titolare del trattamento, finalità, basi giuridiche, conservazione e diritti degli utenti.';

export const metadata: Metadata = {
    title: 'Informativa sulla Privacy',
    description: PRIVACY_DESCRIPTION,
    ...shareMetadata(undefined, {
        title: `Informativa sulla Privacy | ${SITE_NAME}`,
        description: PRIVACY_DESCRIPTION,
        path: '/privacy',
    }),
    alternates: {
        canonical: '/privacy',
    },
};

export default function PrivacyPage() {
    return <PrivacyClient />;
}
