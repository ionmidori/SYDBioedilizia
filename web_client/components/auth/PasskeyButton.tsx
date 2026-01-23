'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { usePasskey } from '@/hooks/usePasskey';
import { useAuth } from '@/hooks/useAuth';

interface PasskeyButtonProps {
    mode: 'register' | 'login';
    userId?: string;  // Required for login mode
    onSuccess?: () => void;
}

/**
 * Passkey authentication button.
 * 
 * Modes:
 * - register: For authenticated users to add biometric login
 * - login: For unauthenticated users to sign in with biometrics
 */
export function PasskeyButton({ mode, userId, onSuccess }: PasskeyButtonProps) {
    const { checkSupport, registerPasskey, authenticateWithPasskey, isRegistering, isAuthenticating } = usePasskey();
    const { user } = useAuth();
    const [isSupported, setIsSupported] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        checkSupport().then(support => {
            setIsSupported(support.isSupported && support.isPlatformAuthenticator);
        });
    }, [checkSupport]);

    if (!isSupported) {
        return null;  // Don't show button if not supported
    }

    const handleClick = async () => {
        setError('');

        try {
            if (mode === 'register') {
                if (!user) {
                    setError('Devi essere autenticato per registrare una passkey');
                    return;
                }
                await registerPasskey();
                onSuccess?.();
            } else {
                if (!userId) {
                    setError('Email richiesta');
                    return;
                }
                await authenticateWithPasskey(userId);
                onSuccess?.();
            }
        } catch (err: any) {
            console.error('[PasskeyButton] Error:', err);
            setError(err.message || 'Errore durante l\'autenticazione');
        }
    };

    const isLoading = isRegistering || isAuthenticating;

    return (
        <div className="space-y-2">
            <button
                onClick={handleClick}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-medium rounded-lg transition-all flex items-center justify-center space-x-2 shadow-lg"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>{mode === 'register' ? 'Registrazione...' : 'Verifica...'}</span>
                    </>
                ) : (
                    <>
                        <Fingerprint className="w-5 h-5" />
                        <span>{mode === 'register' ? 'Registra Biometria' : 'Accedi con Biometria'}</span>
                    </>
                )}
            </button>

            {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            {mode === 'register' && (
                <p className="text-xs text-slate-500 text-center">
                    Usa FaceID o TouchID per accedere senza password
                </p>
            )}
        </div>
    );
}
