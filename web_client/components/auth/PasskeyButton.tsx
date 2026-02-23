'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { usePasskey } from '@/hooks/usePasskey';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PasskeyButtonProps {
    mode: 'register' | 'login';
    userId?: string;  // Required for login mode
    onSuccess?: () => void;
    className?: string; // 🔥 NEW PROP
}

/**
 * Passkey authentication button.
 * 
 * Modes:
 * - register: For authenticated users to add biometric login
 * - login: For unauthenticated users to sign in with biometrics
 */
export function PasskeyButton({ mode, userId, onSuccess, className }: PasskeyButtonProps) {
    const { checkSupport, registerPasskey, authenticateWithPasskey, isRegistering, isAuthenticating } = usePasskey();
    const { user } = useAuth();
    const [isSupported, setIsSupported] = useState(false);
    const [error, setError] = useState('');
    const [showGuidanceDialog, setShowGuidanceDialog] = useState(false);

    useEffect(() => {
        checkSupport().then(support => {
            // Check if platform authenticator (TouchID/FaceID) is available
            setIsSupported(support.isSupported); 
        });
    }, [checkSupport]);

    if (!isSupported) {
        return null; 
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
                await authenticateWithPasskey(userId);
                onSuccess?.();
            }
        } catch (err) {
            console.error('[PasskeyButton] Error:', err);
            const message = err instanceof Error ? err.message : 'Errore sconosciuto';
            
            if (mode === 'login') {
                // In login mode, any error (user not found, cancelled, etc) 
                // suggests the user might not have set it up or it failed.
                // We show the guidance dialog.
                setShowGuidanceDialog(true);
            } else {
                // In register mode, show inline error
                setError(message || 'Errore durante l\'operazione');
            }
        }
    };

    const isLoading = isRegistering || isAuthenticating;

    return (
        <>
            <div className="space-y-3 w-full">
                <button
                    onClick={handleClick}
                    disabled={isLoading}
                    className={cn(
                        "w-full py-4 px-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl hover:bg-luxury-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-luxury-gold/10 flex items-center justify-center gap-3 border border-luxury-gold/20 h-14",
                        className
                    )}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{mode === 'register' ? 'Registrazione...' : 'Verifica...'}</span>
                        </>
                    ) : (
                        <>
                            <Fingerprint className="w-5 h-5" />
                            <span>{mode === 'register' ? 'Attiva Accesso Biometrico' : 'Accedi con Biometria'}</span>
                        </>
                    )}
                </button>

                {error && mode === 'register' && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-400 text-center flex items-center justify-center gap-2">
                            ⚠️ {error}
                        </p>
                    </div>
                )}

                {mode === 'register' && !error && (
                    <p className="text-xs text-luxury-text/50 text-center">
                        Usa FaceID o TouchID per accedere senza password
                    </p>
                )}
            </div>

            <Dialog open={showGuidanceDialog} onOpenChange={setShowGuidanceDialog}>
                <DialogContent className="sm:max-w-md bg-luxury-bg/95 backdrop-blur-xl border-luxury-gold/20 text-luxury-text">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-serif text-luxury-gold flex items-center gap-2">
                            <Fingerprint className="w-6 h-6" />
                            Biometria non attiva
                        </DialogTitle>
                        <DialogDescription className="text-luxury-text/70 pt-2">
                            Non abbiamo trovato credenziali biometriche associate a questo dispositivo.
                            <br /><br />
                            Per usare FaceID o TouchID, devi prima accedere con <strong>Email</strong> o <strong>Google/Apple</strong>, e poi attivare la biometria dal tuo Profilo.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="sm:justify-center mt-4">
                        <Button 
                            onClick={() => setShowGuidanceDialog(false)}
                            className="bg-luxury-gold text-luxury-bg hover:bg-luxury-gold/90 w-full sm:w-auto"
                        >
                            Ho capito, accedo con Email
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
