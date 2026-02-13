'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <div className="min-h-screen bg-luxury-bg flex items-center justify-center p-6">
            <div className="max-w-lg w-full space-y-6 text-center">
                {/* Error Icon */}
                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-6">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl font-bold text-luxury-text font-serif">
                    Qualcosa è andato <span className="text-red-500 italic">storto</span>
                </h1>

                {/* Description */}
                <p className="text-luxury-text/60 leading-relaxed max-w-md mx-auto">
                    Si è verificato un errore imprevisto durante il caricamento della pagina.
                    Prova a ricaricare o torna alla homepage.
                </p>

                {/* Error Details (Development Only) */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="glass-premium border-red-500/20 p-4 rounded-xl">
                        <p className="text-xs text-red-400 mb-2 font-mono text-left">
                            <strong>Error:</strong> {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs text-gray-500 font-mono text-left">
                                <strong>Digest:</strong> {error.digest}
                            </p>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                    <Button
                        onClick={reset}
                        className="px-8 py-6 bg-luxury-teal hover:bg-luxury-teal/90 text-white font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Riprova
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        className="px-8 py-6 border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-text font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                        <a href="/">
                            <Home className="w-5 h-5" />
                            Torna alla Home
                        </a>
                    </Button>
                </div>
            </div>
        </div>
    );
}
