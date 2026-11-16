'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    applyActionCode,
    checkActionCode,
    confirmPasswordReset,
    verifyPasswordResetCode,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { PasswordField } from './PasswordField';
import { PasswordChecklist } from './PasswordChecklist';
import {
    resetPasswordConfirmSchema,
    type ResetPasswordConfirmValues,
} from '@/lib/validation/auth-schema';
import { mapAuthError } from '@/utils/auth-utils';

const actionQuerySchema = z.object({
    mode: z.enum(['resetPassword', 'verifyEmail', 'recoverEmail']),
    oobCode: z.string().trim().min(1).max(2048),
});

/**
 * Only allow relative internal paths or same-origin URLs for post-action navigation
 * to prevent open-redirect phishing via crafted Firebase `continueUrl` params.
 */
export function sanitizeContinueUrl(raw: string | null): string {
    if (!raw) return '/';
    const trimmed = raw.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
        return trimmed;
    }
    if (typeof window !== 'undefined') {
        try {
            const parsed = new URL(trimmed);
            if (parsed.origin === window.location.origin) {
                return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
            }
        } catch {
            return '/';
        }
    }
    return '/';
}

type ActionPhase =
    | { status: 'loading' }
    | { status: 'reset_form'; email: string }
    | { status: 'done'; title: string; description: string }
    | { status: 'error'; message: string };

export function AuthActionClient() {
    const searchParams = useSearchParams();
    const rawMode = searchParams.get('mode') ?? '';
    const rawCode = searchParams.get('oobCode') ?? '';
    const safeContinueUrl = sanitizeContinueUrl(searchParams.get('continueUrl'));

    const validParams = useMemo(() => {
        const parsed = actionQuerySchema.safeParse({ mode: rawMode, oobCode: rawCode });
        return parsed.success ? parsed.data : null;
    }, [rawMode, rawCode]);

    const [phase, setPhase] = useState<ActionPhase>(() =>
        validParams
            ? { status: 'loading' }
            : { status: 'error', message: 'Link non valido o incompleto. Richiedi un nuovo link dalla schermata di accesso.' },
    );
    const [submitError, setSubmitError] = useState('');

    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<ResetPasswordConfirmValues>({
        resolver: zodResolver(resetPasswordConfirmSchema),
        defaultValues: { password: '', confirmPassword: '' },
    });

    const passwordValue = useWatch({ control, name: 'password' }) ?? '';

    useEffect(() => {
        if (!validParams) return;
        let cancelled = false;

        async function processAction(mode: 'resetPassword' | 'verifyEmail' | 'recoverEmail', oobCode: string) {
            try {
                if (mode === 'resetPassword') {
                    const email = await verifyPasswordResetCode(auth, oobCode);
                    if (!cancelled) {
                        setPhase({ status: 'reset_form', email });
                    }
                    return;
                }
                if (mode === 'verifyEmail') {
                    await applyActionCode(auth, oobCode);
                    if (!cancelled) {
                        setPhase({
                            status: 'done',
                            title: 'Email verificata',
                            description: 'Il tuo indirizzo email è stato confermato con successo.',
                        });
                    }
                    return;
                }
                const info = await checkActionCode(auth, oobCode);
                await applyActionCode(auth, oobCode);
                if (!cancelled) {
                    const restoredEmail = info.data.email;
                    setPhase({
                        status: 'done',
                        title: 'Indirizzo email ripristinato',
                        description: restoredEmail
                            ? `L'indirizzo ${restoredEmail} è stato ripristinato. Ti consigliamo di aggiornare subito la password.`
                            : 'Il tuo indirizzo email originale è stato ripristinato.',
                    });
                }
            } catch (err) {
                if (cancelled) return;
                const code = (err as { code?: string })?.code ?? '';
                setPhase({ status: 'error', message: mapAuthError(code) });
            }
        }

        void processAction(validParams.mode, validParams.oobCode);

        return () => {
            cancelled = true;
        };
    }, [validParams]);

    const onSubmitReset = async (values: ResetPasswordConfirmValues) => {
        if (!validParams || validParams.mode !== 'resetPassword') return;
        setSubmitError('');
        try {
            await confirmPasswordReset(auth, validParams.oobCode, values.password);
            setPhase({
                status: 'done',
                title: 'Password aggiornata',
                description: 'La tua nuova password è attiva. Ora puoi accedere con le nuove credenziali.',
            });
        } catch (err) {
            const code = (err as { code?: string })?.code ?? '';
            setSubmitError(mapAuthError(code));
        }
    };

    return (
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-xl space-y-6">
            {phase.status === 'loading' && (
                <div className="py-8 flex flex-col items-center gap-3 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-accent-ink" aria-hidden="true" />
                    <p className="text-sm text-ink-muted">Verifica del link in corso...</p>
                </div>
            )}

            {phase.status === 'error' && (
                <div className="space-y-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-danger-subtle flex items-center justify-center mx-auto">
                        <AlertCircle className="w-6 h-6 text-danger-ink" aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-serif font-bold text-ink">Link non utilizzabile</h1>
                    <p className="text-sm text-ink-muted" role="alert">{phase.message}</p>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center w-full h-11 rounded-xl bg-accent text-on-accent font-semibold text-sm hover:opacity-90 transition-opacity"
                    >
                        Torna alla home
                    </Link>
                </div>
            )}

            {phase.status === 'done' && (
                <div className="space-y-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-success-subtle flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-6 h-6 text-success-ink" aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-serif font-bold text-ink">{phase.title}</h1>
                    <p className="text-sm text-ink-muted" role="status">{phase.description}</p>
                    <Link
                        href={safeContinueUrl}
                        className="inline-flex items-center justify-center w-full h-11 rounded-xl bg-accent text-on-accent font-semibold text-sm hover:opacity-90 transition-opacity"
                    >
                        {safeContinueUrl === '/' ? 'Torna alla home' : 'Continua'}
                    </Link>
                </div>
            )}

            {phase.status === 'reset_form' && (
                <form onSubmit={handleSubmit(onSubmitReset)} className="space-y-4" noValidate>
                    <div className="space-y-1 text-center">
                        <div className="w-12 h-12 rounded-full bg-accent-subtle flex items-center justify-center mx-auto mb-3">
                            <KeyRound className="w-6 h-6 text-accent-ink" aria-hidden="true" />
                        </div>
                        <h1 className="text-2xl font-serif font-bold text-ink">Nuova password</h1>
                        <p className="text-sm text-ink-muted">
                            Imposta una nuova password sicura per <strong className="text-ink">{phase.email}</strong>
                        </p>
                    </div>

                    <PasswordField
                        {...register('password')}
                        label="Nuova password"
                        placeholder="••••••••"
                        error={errors.password?.message}
                        autoComplete="new-password"
                    />

                    <PasswordChecklist password={passwordValue} />

                    <PasswordField
                        {...register('confirmPassword')}
                        label="Conferma nuova password"
                        placeholder="••••••••"
                        error={errors.confirmPassword?.message}
                        autoComplete="new-password"
                    />

                    {submitError && (
                        <div className="flex items-center gap-2 p-3 bg-danger-subtle border border-danger/20 rounded-lg" role="alert">
                            <AlertCircle className="w-4 h-4 text-danger-ink shrink-0" aria-hidden="true" />
                            <p className="text-sm text-danger-ink">{submitError}</p>
                        </div>
                    )}

                    <Button type="submit" className="w-full bg-accent text-on-accent hover:bg-accent/90" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                        Salva nuova password
                    </Button>
                </form>
            )}
        </div>
    );
}
