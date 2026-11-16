import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { AuthActionClient } from '@/components/auth/AuthActionClient';

export const metadata: Metadata = {
    title: 'Gestione Account | SYD Bioedilizia',
    robots: { index: false, follow: false },
};

export default function AuthActionPage() {
    return (
        <main className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
            <Suspense
                fallback={
                    <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-xl flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-accent-ink" aria-hidden="true" />
                        <p className="text-sm text-ink-muted">Caricamento...</p>
                    </div>
                }
            >
                <AuthActionClient />
            </Suspense>
        </main>
    );
}
