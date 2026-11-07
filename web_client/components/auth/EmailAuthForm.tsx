'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createAccountKeepingGuestChats, signInKeepingGuestChats } from '@/lib/auth/guest-claim';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react';
import { mapAuthError, triggerHapticFeedback } from '@/utils/auth-utils';
import { authSchema, type AuthValues } from '@/lib/validation/auth-schema';
import { triggerHaptic } from '@/utils/haptics';
import { sanitizeMessage } from '@/utils/security';

interface EmailAuthFormProps {
    onSuccess?: () => void;
}

export function EmailAuthForm({ onSuccess }: EmailAuthFormProps) {
    const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resetSent, setResetSent] = useState(false);
    const [shake, setShake] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockoutTime, setLockoutTime] = useState(0);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors }
    } = useForm<AuthValues>({
        resolver: zodResolver(authSchema),
        defaultValues: {
            email: '',
            password: ''
        }
    });

    // Reset errors when mode changes
    useEffect(() => {
        reset({ email: '', password: '' });
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear the stale error when switching between login/register/reset modes
        setError('');
    }, [mode, reset]);

    const onSubmit = async (data: AuthValues) => {
        if (lockoutTime > 0) return;

        // Manual check for password if not in reset mode (since it's optional in schema for reset logic)
        if (mode !== 'reset' && !data.password) {
            return;
        }

        setError('');
        setShake(false);
        setLoading(true);
        triggerHaptic();

        try {
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, data.email);
                setResetSent(true);
                setTimeout(() => {
                    setMode('signin');
                    setResetSent(false);
                }, 3000);
            } else if (mode === 'signin') {
                await signInKeepingGuestChats(() => signInWithEmailAndPassword(auth, data.email, data.password!));
                setFailedAttempts(0);
                onSuccess?.();
            } else {
                await createAccountKeepingGuestChats(
                    EmailAuthProvider.credential(data.email, data.password!),
                    () => createUserWithEmailAndPassword(auth, data.email, data.password!)
                );
                setFailedAttempts(0);
                onSuccess?.();
            }
        } catch (err) {
            const error = err as { code: string };
            const friendlyError = mapAuthError(error.code);
            setError(sanitizeMessage(friendlyError));
            setShake(true);
            triggerHapticFeedback('heavy');

            // Rate limiting
            const newFailed = failedAttempts + 1;
            setFailedAttempts(newFailed);

            if (newFailed >= 3) {
                setLockoutTime(30);
                const timer = setInterval(() => {
                    setLockoutTime((prev) => {
                        if (prev <= 1) {
                            clearInterval(timer);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }

            setTimeout(() => setShake(false), 500);
        } finally {
            setLoading(false);
        }
    };

    if (resetSent) {
        return (
            <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 bg-success-subtle rounded-full flex items-center justify-center mx-auto">
                    <Mail className="w-6 h-6 text-success-ink" />
                </div>
                <h3 className="text-lg font-semibold text-ink">Email Inviata!</h3>
                <p className="text-sm text-ink-muted">
                    Controlla la tua casella di posta per reimpostare la password.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="email" className="text-ink-muted">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" />
                    <Input
                        {...register('email')}
                        id="email"
                        type="email"
                        placeholder="nome@esempio.com"
                        className={`pl-10 bg-surface-muted border-line-strong text-ink transition-all ${
                            shake || errors.email ? 'animate-shake border-danger' : ''
                        }`}
                        autoComplete="email"
                    />
                </div>
                {errors.email && (
                    <p className="text-xs text-danger-ink mt-1">{errors.email.message}</p>
                )}
            </div>

            {mode !== 'reset' && (
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-ink-muted">Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" />
                        <Input
                            {...register('password')}
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            className={`pl-10 bg-surface-muted border-line-strong text-ink transition-all ${
                                shake || errors.password ? 'animate-shake border-danger' : ''
                            }`}
                            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        />
                    </div>
                    {errors.password && (
                        <p className="text-xs text-danger-ink mt-1">{errors.password.message}</p>
                    )}
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 bg-danger-subtle border border-danger/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-danger-ink flex-shrink-0" />
                    <p className="text-sm text-danger-ink">
                        {lockoutTime > 0 
                            ? `Troppi tentativi falliti. Attendi ${lockoutTime} secondi.` 
                            : error}
                    </p>
                </div>
            )}

            <Button
                type="submit"
                className="w-full bg-info hover:bg-info"
                disabled={loading || lockoutTime > 0}
            >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {lockoutTime > 0 
                    ? `Bloccato (${lockoutTime}s)` 
                    : (mode === 'reset' ? 'Invia Email di Reset' : mode === 'signin' ? 'Accedi' : 'Registrati')}
            </Button>

            <div className="space-y-2 text-center text-sm">
                {mode === 'signin' && (
                    <>
                        <button
                            type="button"
                            onClick={() => setMode('reset')}
                            className="text-info-ink hover:text-info-ink transition-colors"
                        >
                            Password dimenticata?
                        </button>
                        <div className="text-ink-muted">
                            Non hai un account?{' '}
                            <button
                                type="button"
                                onClick={() => setMode('signup')}
                                className="text-info-ink hover:text-info-ink transition-colors"
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
                        className="text-info-ink hover:text-info-ink transition-colors"
                    >
                        &larr; Torna all&apos;accesso
                    </button>
                )}
            </div>
        </form>
    );
}
