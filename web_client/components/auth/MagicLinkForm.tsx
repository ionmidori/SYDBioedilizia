'use client';

import { useState } from 'react';
import { Mail, Send, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface MagicLinkFormProps {
    onSuccess?: () => void;
}

/**
 * Magic Link login form.
 * 
 * UX Flow:
 * 1. Input email
 * 2. Click "Invia Link"
 * 3. Show success message "✉️ Controlla la tua posta"
 * 4. User clicks link in email
 * 5. Redirected to /auth/verify
 */
export function MagicLinkForm({ onSuccess }: MagicLinkFormProps) {
    const { sendMagicLink } = useAuth();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || isLoading) return;

        setIsLoading(true);
        setError('');

        try {
            await sendMagicLink(email.toLowerCase());
            setSuccess(true);

            // Close dialog after 3 seconds
            if (onSuccess) {
                setTimeout(onSuccess, 3000);
            }
        } catch (error: any) {
            console.error('[MagicLinkForm] Error:', error);

            // Handle Firebase errors
            if (error.code === 'auth/invalid-email') {
                setError('Email non valida');
            } else if (error.message?.includes('429')) {
                setError('Troppe richieste. Riprova tra un\'ora.');
            } else {
                setError('Errore nell\'invio. Riprova.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center py-8 space-y-4">
                <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
                <h3 className="text-xl font-semibold text-white">Email inviata!</h3>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                    Ti abbiamo inviato un link di accesso.<br />
                    Controlla anche lo spam se non lo trovi.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <label htmlFor="magic-email" className="text-sm font-medium text-slate-300">
                    Email
                </label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        id="magic-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tua@email.com"
                        required
                        className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-medium rounded-lg transition-all flex items-center justify-center space-x-2"
            >
                {isLoading ? (
                    <span>Invio in corso...</span>
                ) : (
                    <>
                        <Send className="w-4 h-4" />
                        <span>Invia Link Magico</span>
                    </>
                )}
            </button>

            <p className="text-xs text-slate-500 text-center mt-4">
                Riceverai un'email con un link sicuro per accedere senza password
            </p>
        </form>
    );
}
