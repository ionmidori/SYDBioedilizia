'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { usePasskey } from '@/hooks/usePasskey';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface PasskeyButtonProps {
    mode: 'register' | 'login';
    userId?: string;  // Required for login mode
    onSuccess?: () => void;
    className?: string; // 🔥 NEW PROP
}

/**
 * Maps errors thrown by usePasskey to a readable Italian message. Unexpected
 * errors (e.g. a raw TypeError from a malformed backend response) are not
 * shown verbatim to the user — only the messages usePasskey explicitly
 * raises for known conditions (cancellation, auth required, backend detail)
 * are passed through as-is.
 */
function toReadableMessage(err: unknown): string {
    if (!(err instanceof Error)) {
        return 'Errore sconosciuto durante l\'operazione.';
    }
    const knownMessages = [
        'Registrazione annullata',
        'Autenticazione annullata',
        'Devi essere autenticato per registrare una passkey',
        'User must be authenticated to register passkey',
        'No credential created',
        'No assertion returned',
    ];
    if (knownMessages.includes(err.message) || err.name === 'NotAllowedError') {
        return err.message;
    }
    // Backend-provided `detail` messages also pass through unchanged.
    if (err.message && !(err instanceof TypeError)) {
        return err.message;
    }
    return 'Impossibile completare l\'operazione biometrica. Riprova o contatta l\'assistenza.';
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
        return mode === 'register' ? (
            <div className="p-3 bg-surface border border-line rounded-lg">
                <p className="text-sm text-ink-muted text-center">
                    Il tuo dispositivo o browser non supporta l&apos;accesso biometrico (WebAuthn).
                </p>
            </div>
        ) : null;
    }

    const handleClick = async () => {
        triggerHaptic();
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
            const message = toReadableMessage(err);

            if (mode === 'login') {
                // In login mode, any error (user not found, cancelled, etc)
                // suggests the user might not have set it up or it failed.
                // We show the guidance dialog.
                setShowGuidanceDialog(true);
            } else {
                // In register mode, show inline error
                setError(message);
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
                        "relative w-full h-14 flex items-center justify-center gap-3 font-bold rounded-[16px] overflow-hidden group",
                        "bg-gradient-to-r from-accent via-accent-subtle to-accent bg-[length:200%_auto] text-on-accent",
                        "border border-line-strong shadow-[0_4px_15px_-6px_color-mix(in_oklab,var(--color-accent)_40%,transparent),inset_0_1px_1px_color-mix(in_oklab,var(--color-on-primary)_40%,transparent)]",
                        "hover:bg-[100%_center] hover:shadow-[0_4px_20px_-6px_color-mix(in_oklab,var(--color-accent)_50%,transparent)] hover:scale-[1.02]",
                        "transition-all duration-500 ease-out",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                        className
                    )}
                >
                    {/* Shimmer effect overlay */}
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-on-scrim/20 to-transparent" />

                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                            <span className="relative z-10 tracking-wide uppercase text-sm">{mode === 'register' ? 'Registrazione...' : 'Verifica...'}</span>
                        </>
                    ) : (
                        <>
                            <Fingerprint className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform duration-300" />
                            <span className="relative z-10 tracking-wide uppercase text-sm">{mode === 'register' ? 'Attiva Accesso Biometrico' : 'Accedi con Biometria'}</span>
                        </>
                    )}
                </button>

                {error && mode === 'register' && (
                    <div className="p-3 bg-danger-subtle border border-danger/20 rounded-lg">
                        <p className="text-sm text-danger-ink text-center flex items-center justify-center gap-2">
                            ⚠️ {error}
                        </p>
                    </div>
                )}

                {mode === 'register' && !error && (
                    <p className="text-xs text-ink-muted text-center font-medium">
                        Usa FaceID o TouchID per accedere senza password
                    </p>
                )}
            </div>

            <Dialog open={showGuidanceDialog} onOpenChange={setShowGuidanceDialog}>
                <DialogContent className="sm:max-w-md bg-canvas backdrop-blur-xl border-line text-ink rounded-[24px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-serif text-accent-ink flex items-center gap-2">
                            <Fingerprint className="w-6 h-6" />
                            Biometria non attiva
                        </DialogTitle>
                        <DialogDescription className="text-ink-muted pt-2">
                            Non abbiamo trovato credenziali biometriche associate a questo dispositivo.
                            <br /><br />
                            Per usare FaceID o TouchID, devi prima accedere con <strong>Email</strong> o <strong>Google</strong>, e poi attivare la biometria dal tuo Profilo.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="sm:justify-center mt-4">
                        <Button 
                            onClick={() => setShowGuidanceDialog(false)}
                            className="bg-accent text-on-accent hover:bg-accent w-full sm:w-auto rounded-xl font-bold"
                        >
                            Ho capito, accedo con Email
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
