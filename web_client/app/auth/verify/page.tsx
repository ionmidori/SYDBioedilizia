import type { Metadata } from 'next';
import { VerifyClient } from '@/components/auth/VerifyClient';

export const metadata: Metadata = {
    title: 'Verifica Accesso',
    robots: {
        index: false,
        follow: false,
    },
};

export default function VerifyPage() {
    return <VerifyClient />;
}
