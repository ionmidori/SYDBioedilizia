'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
// It replaces the root layout, so it must load the global styles (the colour roles) itself.
// The next/font variables are set by the root layout only: here text uses the fallback stack.
import './globals.css';

/**
 * Global Error Boundary (Last Resort)
 * 
 * This component catches errors in the root layout itself.
 * Next.js requires this to have its own <html> and <body> tags.
 * 
 * Scope: Catastrophic failures only (e.g., Provider initialization crash).
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        console.error('[GlobalError] Critical failure:', error);
    }, [error]);

    return (
        <html lang="it">
            <body className="bg-canvas text-ink font-sans antialiased">
                <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="max-w-md w-full space-y-8 text-center">
                        {/* Icon */}
                        <div className="w-20 h-20 mx-auto rounded-full bg-danger-subtle flex items-center justify-center border border-danger/30">
                            <AlertTriangle className="w-10 h-10 text-danger-ink" />
                        </div>

                        {/* Title */}
                        <h1 className="text-3xl font-bold text-ink">
                            Si è verificato un errore critico
                        </h1>

                        {/* Description */}
                        <p className="text-ink-muted leading-relaxed">
                            L&apos;applicazione ha riscontrato un problema inaspettato.
                            Ti consigliamo di ricaricare la pagina o tornare alla home.
                        </p>

                        {/* Error Details (Dev Only) */}
                        {process.env.NODE_ENV === 'development' && (
                            <pre className="text-left text-xs bg-surface-muted p-4 rounded-lg overflow-auto max-h-32 text-danger-ink border border-danger/30">
                                {error.message}
                            </pre>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={reset}
                                className="px-6 py-3 bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-5 h-5" />
                                Riprova
                            </button>
                            <Link
                                href="/"
                                className="px-6 py-3 bg-surface-muted hover:bg-line text-ink font-semibold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Home className="w-5 h-5" />
                                Torna alla Home
                            </Link>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
