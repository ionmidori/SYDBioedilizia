'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Send, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { magicLinkSchema, type MagicLinkValues } from '@/lib/validation/auth-schema';
import { triggerHaptic } from '@/utils/haptics';

interface MagicLinkFormProps {
    onSuccess?: () => void;
}

/**
 * Magic Link login form.
 * Refactored to React Hook Form + Zod for 'advanced-form-patterns' compliance.
 */
export function MagicLinkForm({ onSuccess }: MagicLinkFormProps) {
    const { sendMagicLink } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<MagicLinkValues>({
        resolver: zodResolver(magicLinkSchema),
        defaultValues: {
            email: ''
        }
    });

    const onSubmit = async (data: MagicLinkValues) => {
        setIsLoading(true);
        setError('');
        triggerHaptic();

        try {
            await sendMagicLink(data.email.toLowerCase());
            setSuccess(true);

            // Close dialog after 3 seconds
            if (onSuccess) {
                setTimeout(onSuccess, 3000);
            }
        } catch (error) {
            console.error('[MagicLinkForm] Error:', error);

            // Handle Firebase errors
            const firebaseError = error as { code?: string; message?: string };
            if (firebaseError.code === 'auth/invalid-email') {
                setError('Email non valida');
            } else if (firebaseError.message?.includes('429')) {
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
                <label htmlFor="magic-email" className="text-sm font-medium text-slate-300">
                    Email
                </label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        {...register('email')}
                        id="magic-email"
                        type="email"
                        placeholder="tua@email.com"
                        className={`w-full pl-11 pr-4 py-3 bg-slate-800/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                            errors.email ? 'border-red-500 ring-1 ring-red-500/50' : 'border-slate-700'
                        }`}
                    />
                </div>
                {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
                )}
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
                    <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Invio in corso...</span>
                    </>
                ) : (
                    <>
                        <Send className="w-4 h-4" />
                        <span>Invia Link Magico</span>
                    </>
                )}
            </button>

            <p className="text-xs text-slate-500 text-center mt-4">
                Riceverai un&apos;email con un link sicuro per accedere senza password
            </p>
        </form>
    );
}
