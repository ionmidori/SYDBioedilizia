import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Manutenzione in Corso',
    robots: {
        index: false,
        follow: false,
    },
};

export default function MaintenancePage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4 text-center">
            <div className="space-y-6 max-w-md">
                <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-6xl">
                    Under Maintenance
                </h1>
                <p className="text-lg text-ink-muted">
                    Stiamo eseguendo aggiornamenti importanti ai nostri sistemi.
                    <br />
                    Torneremo online a breve.
                </p>
                <div className="pt-8">
                    <div className="h-1 w-full bg-surface-muted rounded overflow-hidden">
                        <div className="h-full bg-info animate-pulse w-2/3"></div>
                    </div>
                    <p className="text-xs text-ink-muted mt-2">System Upgrade in Progress</p>
                </div>
            </div>
        </div>
    )
}
