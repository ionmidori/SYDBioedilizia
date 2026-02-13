'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Dashboard Error Boundary
 * 
 * Catches unhandled errors in the dashboard and all sub-pages.
 * Provides contextual recovery options for authenticated users.
 * 
 * Scope: /dashboard and all nested routes.
 */
export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        console.error('[DashboardError] Dashboard error:', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-luxury-bg flex items-center justify-center p-6">
            <div className="max-w-lg w-full space-y-6 text-center">
                {/* Error Icon */}
                <div className="w-20 h-20 mx-auto rounded-full glass-premium border-red-500/20 flex items-center justify-center mb-6 shadow-xl">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl font-bold text-luxury-text font-serif leading-tight">
                    Errore nella <span className="text-luxury-gold italic">Dashboard</span>
                </h1>

                {/* Description */}
                <p className="text-luxury-text/60 leading-relaxed max-w-md mx-auto">
                    Si è verificato un problema durante il caricamento di questa sezione.
                    I tuoi dati sono al sicuro. Prova a ricaricare la pagina.
                </p>

                {/* Error Details (Development Only) */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="glass-premium border-red-500/20 p-4 rounded-xl">
                        <p className="text-xs text-red-400 mb-2 font-mono text-left break-all">
                            <strong>Error:</strong> {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs text-gray-500 font-mono text-left">
                                <strong>Digest:</strong> {error.digest}
                            </p>
                        )}
                        {error.stack && (
                            <pre className="text-[10px] text-left text-gray-600 mt-2 overflow-auto max-h-32 bg-black/20 p-2 rounded">
                                {error.stack.slice(0, 500)}
                            </pre>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                    <Button
                        onClick={reset}
                        className="px-8 py-6 bg-luxury-teal hover:bg-luxury-teal/90 text-white font-bold rounded-xl shadow-lg shadow-luxury-teal/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Riprova
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        className="px-8 py-6 border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-text font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                        <a href="/dashboard">
                            <LayoutDashboard className="w-5 h-5" />
                            Torna alla Dashboard
                        </a>
                    </Button>
                </div>
            </div>
        </div>
    );
}
