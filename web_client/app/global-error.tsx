'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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
            <body className="bg-[#1A2930] text-[#E9C46A] font-sans antialiased">
                <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="max-w-md w-full space-y-8 text-center">
                        {/* Icon */}
                        <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <AlertTriangle className="w-10 h-10 text-red-500" />
                        </div>

                        {/* Title */}
                        <h1 className="text-3xl font-bold text-white">
                            Si è verificato un errore critico
                        </h1>

                        {/* Description */}
                        <p className="text-gray-400 leading-relaxed">
                            L'applicazione ha riscontrato un problema inaspettato.
                            Ti consigliamo di ricaricare la pagina o tornare alla home.
                        </p>

                        {/* Error Details (Dev Only) */}
                        {process.env.NODE_ENV === 'development' && (
                            <pre className="text-left text-xs bg-black/30 p-4 rounded-lg overflow-auto max-h-32 text-red-400 border border-red-500/20">
                                {error.message}
                            </pre>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={reset}
                                className="px-6 py-3 bg-[#2A9D8F] hover:bg-[#238276] text-white font-semibold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-5 h-5" />
                                Riprova
                            </button>
                            <a
                                href="/"
                                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Home className="w-5 h-5" />
                                Torna alla Home
                            </a>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
