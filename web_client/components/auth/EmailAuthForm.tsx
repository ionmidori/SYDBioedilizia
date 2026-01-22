'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react';

interface EmailAuthFormProps {
    onSuccess?: () => void;
}

export function EmailAuthForm({ onSuccess }: EmailAuthFormProps) {
    const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resetSent, setResetSent] = useState(false);

    const validateEmail = (email: string) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    };

    const validatePassword = (password: string) => {
        return password.length >= 6; // Firebase minimum
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validation
        if (!validateEmail(email)) {
            setError('Inserisci un indirizzo email valido');
            return;
        }

        if (mode !== 'reset' && !validatePassword(password)) {
            setError('La password deve essere di almeno 6 caratteri');
            return;
        }

        setLoading(true);

        try {
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, email);
                setResetSent(true);
                setTimeout(() => {
                    setMode('signin');
                    setResetSent(false);
                }, 3000);
            } else if (mode === 'signin') {
                await signInWithEmailAndPassword(auth, email, password);
                onSuccess?.();
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
                onSuccess?.();
            }
        } catch (err: any) {
            // User-friendly error messages
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('Credenziali non valide');
            } else if (err.code === 'auth/email-already-in-use') {
                setError('Questo indirizzo email è già registrato');
            } else if (err.code === 'auth/weak-password') {
                setError('Password troppo debole');
            } else if (err.code === 'auth/invalid-email') {
                setError('Indirizzo email non valido');
            } else {
                setError('Si è verificato un errore. Riprova.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (resetSent) {
        return (
            <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                    <Mail className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Email Inviata!</h3>
                <p className="text-sm text-slate-400">
                    Controlla la tua casella di posta per reimpostare la password.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                        placeholder="nome@esempio.com"
                        className="pl-10 bg-slate-800/50 border-slate-700 text-white"
                        required
                    />
                </div>
            </div>

            {mode !== 'reset' && (
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-300">Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="pl-10 bg-slate-800/50 border-slate-700 text-white"
                            required
                        />
                    </div>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
            >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {mode === 'reset' ? 'Invia Email di Reset' : mode === 'signin' ? 'Accedi' : 'Registrati'}
            </Button>

            <div className="space-y-2 text-center text-sm">
                {mode === 'signin' && (
                    <>
                        <button
                            type="button"
                            onClick={() => setMode('reset')}
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            Password dimenticata?
                        </button>
                        <div className="text-slate-400">
                            Non hai un account?{' '}
                            <button
                                type="button"
                                onClick={() => setMode('signup')}
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Registrati
                            </button>
                        </div>
                    </>
                )}
                {(mode === 'signup' || mode === 'reset') && (
                    <button
                        type="button"
                        onClick={() => setMode('signin')}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        ← Torna al Login
                    </button>
                )}
            </div>
        </form>
    );
}
