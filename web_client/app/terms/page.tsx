import type { Metadata } from 'next';
import { TermsClient } from '@/components/legal/TermsClient';
import { SITE_NAME } from '@/lib/site';
import { shareMetadata } from '@/lib/site-share';

const TERMS_DESCRIPTION =
    'Termini e condizioni di servizio di SYD Bioedilizia a Roma: regole di utilizzo del sito, natura indicativa di render AI e bozze di preventivo.';

export const metadata: Metadata = {
    title: 'Termini di Servizio',
    description: TERMS_DESCRIPTION,
    ...shareMetadata(undefined, {
        title: `Termini di Servizio | ${SITE_NAME}`,
        description: TERMS_DESCRIPTION,
        path: '/terms',
    }),
    alternates: {
        canonical: '/terms',
    },
};

export default function TermsPage() {
    return <TermsClient />;
}
