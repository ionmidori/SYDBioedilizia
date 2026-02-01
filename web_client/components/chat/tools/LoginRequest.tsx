import React from 'react';
import { Lock } from 'lucide-react';
// import { useAuth } from '@/hooks/useAuth'; // Removed unused hook

export const LoginRequest = () => {

    const triggerLogin = () => {
        window.dispatchEvent(new Event('OPEN_LOGIN_MODAL'));
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
                        Per generare i rendering personalizzati, abbiamo bisogno che tu acceda al tuo account gratuito.
                    </p>
                    <button
                        onClick={triggerLogin}
                        className="w-full py-2 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-lg transition-colors text-sm"
                    >
                        Accedi o Registrati
                    </button>
                    <p className="text-[10px] text-center mt-2 text-white/40">
                        È gratuito e richiede solo un click.
                    </p>
                </div>
            </div>
        </div>
    );
};
