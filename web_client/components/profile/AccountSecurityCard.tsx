'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    EmailAuthProvider,
    linkWithCredential,
    reauthenticateWithCredential,
    updatePassword,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import { fetchValidated } from '@/lib/api-client';
import { RevokeSessionsResponseSchema } from '@/types/user-auth';
import {
    changePasswordSchema,
    setPasswordSchema,
    type ChangePasswordValues,
    type SetPasswordValues,
} from '@/lib/validation/auth-schema';
import { mapAuthError } from '@/utils/auth-utils';

function StatusBanner({ error, success }: { error: string; success: string }) {
    if (!error && !success) return null;
    return error ? (
        <div className="flex items-center gap-2 p-3 bg-danger-subtle border border-danger/20 rounded-xl text-sm text-danger-ink" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
        </div>
    ) : (
        <div className="flex items-center gap-2 p-3 bg-success-subtle border border-success/20 rounded-xl text-sm text-success-ink" role="status">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <p>{success}</p>
        </div>
    );
}

function ChangePasswordForm({
    onFeedback,
}: {
    onFeedback: (error: string, success: string) => void;
}) {
    const { user } = useAuth();
    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors, isSubmitting },
    } = useForm<ChangePasswordValues>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    const newPasswordValue = useWatch({ control, name: 'newPassword' }) ?? '';

    const onSubmit = async (values: ChangePasswordValues) => {
        if (!user?.email) return;
        onFeedback('', '');
        try {
            const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, values.newPassword);
            reset();
            onFeedback('', 'Password aggiornata con successo.');
        } catch (err) {
            const code = (err as { code?: string })?.code ?? '';
            if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
                onFeedback('La password attuale non è corretta.', '');
                return;
            }
            onFeedback(mapAuthError(code), '');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <PasswordField
                {...register('currentPassword')}
                label="Password attuale"
                placeholder="••••••••"
                error={errors.currentPassword?.message}
                autoComplete="current-password"
            />
            <PasswordField
                {...register('newPassword')}
                label="Nuova password"
                placeholder="••••••••"
                error={errors.newPassword?.message}
                autoComplete="new-password"
            />
            <PasswordChecklist password={newPasswordValue} />
            <PasswordField
                {...register('confirmPassword')}
                label="Conferma nuova password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
            />
            <Button type="submit" className="w-full sm:w-auto bg-accent text-on-accent hover:bg-accent/90" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                Aggiorna password
            </Button>
        </form>
    );
}

function SetPasswordForm({
    onFeedback,
}: {
    onFeedback: (error: string, success: string) => void;
}) {
    const { user, refreshUser } = useAuth();
    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors, isSubmitting },
    } = useForm<SetPasswordValues>({
        resolver: zodResolver(setPasswordSchema),
        defaultValues: { newPassword: '', confirmPassword: '' },
    });

    const newPasswordValue = useWatch({ control, name: 'newPassword' }) ?? '';

    const onSubmit = async (values: SetPasswordValues) => {
        if (!user?.email) return;
        onFeedback('', '');
        try {
            const credential = EmailAuthProvider.credential(user.email, values.newPassword);
            await linkWithCredential(user, credential);
            await refreshUser();
            reset();
            onFeedback('', 'Password impostata con successo. Ora puoi accedere anche con email e password.');
        } catch (err) {
            const code = (err as { code?: string })?.code ?? '';
            onFeedback(mapAuthError(code), '');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <p className="text-sm text-ink-muted">
                Accedi attualmente tramite provider esterno. Puoi impostare una password per entrare anche con la tua email.
            </p>
            <PasswordField
                {...register('newPassword')}
                label="Nuova password"
                placeholder="••••••••"
                error={errors.newPassword?.message}
                autoComplete="new-password"
            />
            <PasswordChecklist password={newPasswordValue} />
            <PasswordField
                {...register('confirmPassword')}
                label="Conferma nuova password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
            />
            <Button type="submit" className="w-full sm:w-auto bg-accent text-on-accent hover:bg-accent/90" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                Imposta password
            </Button>
        </form>
    );
}

/**
 * Account security card for the user profile:
 * - Password management (re-authenticate + update, or link password for OAuth/passkey users)
 * - Global session revocation across all devices
 */
export function AccountSecurityCard() {
    const { user, logout } = useAuth();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [confirmingRevoke, setConfirmingRevoke] = useState(false);
    const [isRevoking, setIsRevoking] = useState(false);

    if (!user || user.isAnonymous || !user.email) {
        return null;
    }

    const hasPasswordProvider =
        Array.isArray(user.providerData) &&
        user.providerData.some((p) => p.providerId === 'password');

    const handleFeedback = (nextError: string, nextSuccess: string) => {
        setError(nextError);
        setSuccess(nextSuccess);
    };

    const handleRevokeAll = async () => {
        setError('');
        setSuccess('');
        setIsRevoking(true);
        try {
            await fetchValidated('/api/py/users/me/sessions/revoke', RevokeSessionsResponseSchema, {
                method: 'POST',
            });
            setConfirmingRevoke(false);
            await logout?.();
        } catch {
            setError('Impossibile disconnettere le sessioni in questo momento. Riprova.');
        } finally {
            setIsRevoking(false);
        }
    };

    return (
        <div className="p-8 glass border border-line rounded-3xl space-y-6">
            <div className="flex items-center gap-3 text-accent-ink">
                <KeyRound className="w-5 h-5" aria-hidden="true" />
                <h3 className="font-bold uppercase tracking-widest text-xs">Password e Sessioni</h3>
            </div>

            <StatusBanner error={error} success={success} />

            {hasPasswordProvider ? (
                <ChangePasswordForm onFeedback={handleFeedback} />
            ) : (
                <SetPasswordForm onFeedback={handleFeedback} />
            )}

            <div className="pt-4 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-0.5">
                    <p className="text-sm font-medium text-ink">Sessioni attive</p>
                    <p className="text-xs text-ink-muted">
                        Disconnetti tutti i dispositivi e browser su cui hai effettuato l&apos;accesso.
                    </p>
                </div>

                {!confirmingRevoke ? (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setConfirmingRevoke(true)}
                        className="shrink-0"
                    >
                        <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
                        Disconnetti tutti i dispositivi
                    </Button>
                ) : (
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setConfirmingRevoke(false)}
                            disabled={isRevoking}
                        >
                            Annulla
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            onClick={handleRevokeAll}
                            disabled={isRevoking}
                        >
                            {isRevoking && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                            Conferma disconnessione
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
