'use client';

import { motion } from 'framer-motion';
import { LogIn, Shield } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

/**
 * AuthPrompt Component
 * Displays when user tries to use chat without being authenticated
 */
export function AuthPrompt() {
    const handleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Login failed:", error);
            alert("Login fallito. Riprova.");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full p-8 text-center"
        >
            <div className="bg-slate-800/50 rounded-2xl p-8 max-w-md border border-slate-700/50">
                <div className="bg-blue-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-8 h-8 text-blue-400" />
                </div>

                <h2 className="text-2xl font-bold text-white mb-3">
                    Accedi per Continuare
                </h2>

                <p className="text-slate-400 mb-6 leading-relaxed">
                    Per utilizzare il chatbot e accedere alle funzionalità di rendering e preventivi,
                    devi effettuare l&apos;accesso con il tuo account Google.
                </p>

                <Button
                    onClick={handleLogin}
                    variant="premium"
                    size="lg"
                    className="gap-2 w-full"
                >
                    <LogIn className="w-5 h-5" />
                    Accedi con Google
                </Button>

                <p className="text-xs text-slate-500 mt-4">
                    🔒 I tuoi dati sono protetti e sicuri
                </p>
            </div>
        </motion.div>
    );
}
