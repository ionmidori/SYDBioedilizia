import React from 'react';
import { Lock } from 'lucide-react';
// import { useAuth } from '@/hooks/useAuth'; // Removed unused hook

export const LoginRequest = () => {

    const triggerLogin = () => {
        console.log('[LoginRequest] Triggering OPEN_LOGIN_MODAL');
        window.dispatchEvent(new CustomEvent('OPEN_LOGIN_MODAL', {
            bubbles: true,
            composed: true
        }));
    };

    return (
        <div className="bg-luxury-gold/10 border border-luxury-gold/30 rounded-xl p-4 my-2 max-w-sm">
            <div className="flex items-start gap-4">
                <div className="p-2 bg-luxury-gold/20 rounded-full shrink-0">
                    <Lock className="w-5 h-5 text-luxury-gold" />
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-luxury-gold mb-1">
                        Accesso Richiesto
                    </h4>
                    <p className="text-sm text-luxury-text/80 mb-3">
                        Per garantire la sicurezza dei suoi dati personali è necessario autenticarsi. Ci vorranno solo pochi secondi.
                    </p>
                    <button
                        onClick={triggerLogin}
                        className="w-full py-2 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-lg transition-colors text-sm"
                    >
                        Accedi o Registrati
                    </button>
                </div>
            </div>
        </div>
    );
};
