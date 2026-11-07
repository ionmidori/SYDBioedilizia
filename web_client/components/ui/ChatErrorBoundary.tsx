'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * ChatErrorBoundary
 * 
 * Catches JavaScript errors anywhere in the Chat Widget tree.
 * Displays a fallback UI with a reload button instead of crashing the whole app.
 */
export class ChatErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("[ChatErrorBoundary] Caught error:", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        // Optional: Trigger a hard reload of the component tree if needed, 
        // but state reset is usually enough for React to re-render.
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4 bg-luxury-bg/50 rounded-2xl border border-red-500/20">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-luxury-text">
                        Qualcosa è andato storto
                    </h3>
                    <p className="text-sm text-luxury-text/60 max-w-xs">
                        Si è verificato un errore nel caricamento della chat.
                    </p>
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <pre className="text-xs text-left bg-black/20 p-2 rounded w-full overflow-auto max-h-32 text-red-400">
                            {this.state.error.toString()}
                        </pre>
                    )}
                    <Button
                        onClick={this.handleReset}
                        variant="secondary"
                        size="lg"
                        className="mt-6 border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-text gap-3 px-8 h-12 text-base active:scale-95 transition-transform"
                    >
                        <RefreshCw className="w-5 h-5" />
                        Ricarica Chat
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
