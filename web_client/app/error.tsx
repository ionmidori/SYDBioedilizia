'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Link from 'next/link';

/**
 * Root Error Boundary
 * 
 * Catches unhandled errors in any page under the root layout.
 * Shows a branded recovery UI instead of a white screen.
 * 
 * Scope: All pages except those with their own error.tsx (e.g., /dashboard).
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        console.error('[RootError] Uncaught error:', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
            <div className="max-w-lg w-full space-y-6 text-center">
                {/* Error Icon */}
                <div className="w-16 h-16 mx-auto rounded-full bg-danger-subtle flex items-center justify-center border border-danger/20 mb-6">
                    <AlertTriangle className="w-8 h-8 text-danger-ink" />
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl font-bold text-ink font-serif">
                    Qualcosa è andato <span className="text-danger-ink italic">storto</span>
                </h1>

                {/* Description */}
                <p className="text-ink-muted leading-relaxed max-w-md mx-auto">
                    Si è verificato un errore imprevisto durante il caricamento della pagina.
                    Prova a ricaricare o torna alla homepage.
                </p>

                {/* Error Details (Development Only) */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="glass-premium border-danger/20 p-4 rounded-xl">
                        <p className="text-xs text-danger-ink mb-2 font-mono text-left">
                            <strong>Error:</strong> {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs text-ink-subtle font-mono text-left">
                                <strong>Digest:</strong> {error.digest}
                            </p>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                    <Button
                        onClick={reset}
                        className="px-8 py-6 font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Riprova
                    </Button>
                    <Button
                        asChild
                        variant="secondary"
                        className="px-8 py-6 border-line hover:bg-accent-subtle text-ink font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                        <Link href="/">
                            <Home className="w-5 h-5" />
                            Torna alla Home
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
