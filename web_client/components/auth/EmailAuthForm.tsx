'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
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
import { PasswordField } from './PasswordField';
import { PasswordChecklist } from './PasswordChecklist';
import { Loader2, Mail, AlertCircle } from 'lucide-react';
import { mapAuthError, triggerHapticFeedback } from '@/utils/auth-utils';
import { resetPasswordSchema, signinSchema, signupSchema } from '@/lib/validation/auth-schema';
import { triggerHaptic } from '@/utils/haptics';
import { sanitizeMessage } from '@/utils/security';

type Mode = 'signin' | 'signup' | 'reset';

interface AuthFormValues {
    email: string;
    password: string;
    confirmPassword: string;
}

/**
 * Each mode validates with its own schema: strength rules (and the second
 * password entry) apply only when CHOOSING a password, never at sign-in, so
 * accounts created under an older policy can still log in.
 */
const SCHEMAS = { signin: signinSchema, signup: signupSchema, reset: resetPasswordSchema } as const;

const EMPTY_VALUES: AuthFormValues = { email: '', password: '', confirmPassword: '' };
const LOCKOUT_STORAGE_KEY = 'syd.email_auth.lockout.v1';

interface LockoutState {
    failedAttempts: number;
    lockedUntil: number;
}

function readLockoutState(): LockoutState {
    if (typeof window === 'undefined') return { failedAttempts: 0, lockedUntil: 0 };
    try {
        const raw = window.sessionStorage.getItem(LOCKOUT_STORAGE_KEY);
        if (!raw) return { failedAttempts: 0, lockedUntil: 0 };
        const parsed = JSON.parse(raw) as Partial<LockoutState>;
        return {
            failedAttempts: typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0,
            lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
        };
    } catch {
        return { failedAttempts: 0, lockedUntil: 0 };
    }
}

function writeLockoutState(state: LockoutState): void {
    if (typeof window === 'undefined') return;
    try {
        if (state.failedAttempts === 0 && state.lockedUntil === 0) {
            window.sessionStorage.removeItem(LOCKOUT_STORAGE_KEY);
        } else {
            window.sessionStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(state));
        }
    } catch {
        // Ignore storage errors (private mode / quota).
    }
}

function remainingSeconds(lockedUntil: number): number {
    if (lockedUntil <= 0) return 0;
    return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

function computeLockoutSeconds(attempts: number): number {
    if (attempts < 3) return 0;
    // Exponential UX backoff: 30s -> 60s -> 120s (capped).
    return Math.min(120, 30 * 2 ** (attempts - 3));
}

function recordFailedAttempt(prevAttempts: number): {
    failedAttempts: number;
    seconds: number;
    lockedUntil: number;
} {
    const failedAttempts = prevAttempts + 1;
    const seconds = computeLockoutSeconds(failedAttempts);
    const lockedUntil = seconds > 0 ? Date.now() + seconds * 1000 : 0;
    writeLockoutState({ failedAttempts, lockedUntil });
    return { failedAttempts, seconds, lockedUntil };
}

interface EmailAuthFormProps {
    onSuccess?: () => void;
}

export function EmailAuthForm({ onSuccess }: EmailAuthFormProps) {
    const [mode, setMode] = useState<Mode>('signin');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resetSent, setResetSent] = useState(false);
    const [shake, setShake] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState<number>(() => readLockoutState().failedAttempts);
    const [lockedUntil, setLockedUntil] = useState<number>(() => readLockoutState().lockedUntil);
    const [lockoutTime, setLockoutTime] = useState<number>(() => remainingSeconds(readLockoutState().lockedUntil));

    useEffect(() => {
        if (lockedUntil <= Date.now()) {
            return;
        }
        const tick = () => {
            const left = remainingSeconds(lockedUntil);
            setLockoutTime(left);
            if (left <= 0) {
                setLockedUntil(0);
            }
        };
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [lockedUntil]);

    const resolver = useMemo(
        () => zodResolver(SCHEMAS[mode] as never) as unknown as Resolver<AuthFormValues>,
        [mode],
    );

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors }
    } = useForm<AuthFormValues>({
        resolver,
        defaultValues: EMPTY_VALUES,
    });

    const passwordValue = useWatch({ control, name: 'password' }) ?? '';

    // Reset errors when mode changes
    useEffect(() => {
        reset(EMPTY_VALUES);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear the stale error when switching between login/register/reset modes
        setError('');
    }, [mode, reset]);

    const onSubmit = async (data: AuthFormValues) => {
        if (lockoutTime > 0) return;

        setError('');
        setShake(false);
        setLoading(true);
        triggerHaptic();

        try {
            if (mode === 'reset') {
                try {
                    await sendPasswordResetEmail(auth, data.email);
                } catch (err) {
                    // Unknown address: answer exactly as for a known one, so the
                    // form cannot be used to discover which emails are registered.
                    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
                }
                setResetSent(true);
            } else if (mode === 'signin') {
                await signInKeepingGuestChats(() => signInWithEmailAndPassword(auth, data.email, data.password));
                setFailedAttempts(0);
                setLockedUntil(0);
                setLockoutTime(0);
                writeLockoutState({ failedAttempts: 0, lockedUntil: 0 });
                onSuccess?.();
            } else {
                await createAccountKeepingGuestChats(
                    EmailAuthProvider.credential(data.email, data.password),
                    () => createUserWithEmailAndPassword(auth, data.email, data.password)
                );
                setFailedAttempts(0);
                setLockedUntil(0);
                setLockoutTime(0);
                writeLockoutState({ failedAttempts: 0, lockedUntil: 0 });
                onSuccess?.();
            }
        } catch (err) {
            const error = err as { code: string };
            const friendlyError = mapAuthError(error.code);
            setError(sanitizeMessage(friendlyError));
            setShake(true);
            triggerHapticFeedback('heavy');

            // UX rate limiting with sessionStorage persistence and exponential backoff
            const next = recordFailedAttempt(failedAttempts);
            setFailedAttempts(next.failedAttempts);
            setLockedUntil(next.lockedUntil);
            setLockoutTime(next.seconds);

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
                <h3 className="text-lg font-semibold text-ink">Controlla la tua email</h3>
                <p className="text-sm text-ink-muted" role="status">
                    Se l&apos;indirizzo è registrato, riceverai a breve un&apos;email con le istruzioni per reimpostare la password.
                    Controlla anche la cartella spam.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setResetSent(false);
                        setMode('signin');
                    }}
                    className="inline-flex items-center justify-center min-h-[36px] px-2 rounded-md text-info-ink hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors text-sm"
                >
                    &larr; Torna all&apos;accesso
                </button>
            </div>
        );
    }

    const invalidClass = (hasError: boolean) => (shake || hasError ? 'animate-shake border-danger' : '');

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <div className="space-y-1.5">
                <Label htmlFor="email" className="text-ink-muted">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" />
                    <Input
                        {...register('email')}
                        id="email"
                        type="email"
                        placeholder="nome@esempio.com"
                        className={`pl-10 bg-surface-muted border-line-strong text-ink transition-all ${invalidClass(!!errors.email)}`}
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                    />
                </div>
                {errors.email && (
                    <p className="text-xs text-danger-ink mt-1">{errors.email.message}</p>
                )}
            </div>

            {mode !== 'reset' && (
                <PasswordField
                    {...register('password')}
                    label="Password"
                    placeholder="••••••••"
                    className={invalidClass(!!errors.password)}
                    error={errors.password?.message}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
            )}

            {mode === 'signup' && (
                <>
                    <PasswordChecklist password={passwordValue} />
                    <PasswordField
                        {...register('confirmPassword')}
                        label="Conferma password"
                        placeholder="••••••••"
                        className={invalidClass(!!errors.confirmPassword)}
                        error={errors.confirmPassword?.message}
                        autoComplete="new-password"
                    />
                </>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 bg-danger-subtle border border-danger/20 rounded-lg" role="alert">
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

            <div className="space-y-1 text-center text-sm">
                {mode === 'signin' && (
                    <>
                        <button
                            type="button"
                            onClick={() => setMode('reset')}
                            className="inline-flex items-center justify-center min-h-[36px] px-2 rounded-md text-info-ink hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                        >
                            Password dimenticata?
                        </button>
                        <div className="text-ink-muted">
                            Non hai un account?{' '}
                            <button
                                type="button"
                                onClick={() => setMode('signup')}
                                className="inline-flex items-center justify-center min-h-[36px] px-1.5 rounded-md text-info-ink hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors"
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
                        className="inline-flex items-center justify-center min-h-[36px] px-2 rounded-md text-info-ink hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                    >
                        &larr; Torna all&apos;accesso
                    </button>
                )}
            </div>
        </form>
    );
}
