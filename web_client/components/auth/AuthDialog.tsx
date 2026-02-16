'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProviderButton } from './ProviderButton';
import { EmailAuthForm } from './EmailAuthForm';
import { MagicLinkForm } from './MagicLinkForm';
import { PasskeyButton } from './PasskeyButton';
import { useAuth } from '@/hooks/useAuth';
import { useSessionId } from '@/hooks/useSessionId';
import { projectsApi } from '@/lib/projects-api';
import { Loader2 } from 'lucide-react';

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    redirectOnLogin?: boolean; // 🔥 NEW PROP
}

export function AuthDialog({ open, onOpenChange, redirectOnLogin = true }: AuthDialogProps) {
    const { loginWithGoogle, loginWithApple, user } = useAuth();
    const sessionId = useSessionId();
    const router = useRouter();

    /**
     * Safety Valve: Auto-close and redirect if user is already authenticated
     * This handles edge cases where the dialog stays open after successful login
     */
    useEffect(() => {
        if (open && user && !user.isAnonymous) {
            console.log('[AuthDialog] Closing for authenticated user');

            // Debounce per evitare loop se navigation fallisce
            const timer = setTimeout(() => {
                onOpenChange(false);
                if (redirectOnLogin) {
                    router.push('/dashboard');
                }
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [open, user, onOpenChange, router, redirectOnLogin]);

    const [loading, setLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'social' | 'magic' | 'email'>('social');
    const [claimStatus, setClaimStatus] = useState<string | null>(null);

    /**
     * Handles post-login logic: claim session and redirect.
     * It attempts to "claim" the current guest session for the new user.
     */
    const handleLoginSuccess = async () => {
        setClaimStatus('Finalizzazione...');

        // Close dialog FIRST to prevent state persistence across navigation
        onOpenChange(false);

        try {
            // 1. Attempt to claim the current project/session
            if (sessionId) {
                console.log('[AuthDialog] Attempting to claim session:', sessionId);
                await projectsApi.claimProject(sessionId);
                console.log('[AuthDialog] Session claimed successfully.');
            }
        } catch (error) {
            // Non-blocking error: If claiming fails (e.g., already claimed), just log it.
            // The user is still logged in, so we proceed to dashboard.
            console.warn('[AuthDialog] Claim failed (non-fatal):', error);
        } finally {
            setClaimStatus(null);
            if (redirectOnLogin) {
                router.push('/dashboard');
            }
        }
    };

    const handleGoogleSignIn = async () => {
        if (loading) return;
        setLoading('google');

        try {
            await loginWithGoogle();
            // Proceed to claim logic
            await handleLoginSuccess();
        } catch (error) {
            console.error('Google sign-in error:', error);
            const err = error as { code?: string };
            if (err.code !== 'auth/popup-closed-by-user') {
                alert('Errore durante il login con Google. Riprova.');
            }
        } finally {
            setLoading(null);
        }
    };

    const handleAppleSignIn = async () => {
        if (loading) return;
        setLoading('apple');

        try {
            await loginWithApple();
            // Proceed to claim logic
            await handleLoginSuccess();
        } catch (error) {
            console.error('Apple sign-in error:', error);
            const err = error as { code?: string };
            if (err.code !== 'auth/popup-closed-by-user') {
                alert('Errore durante il login con Apple. Riprova.');
            }
        } finally {
            setLoading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-white text-center">
                        Benvenuto in SYD
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-center">
                        Accedi per salvare le tue conversazioni e accedere a tutte le funzionalità
                    </DialogDescription>
                </DialogHeader>

                {claimStatus ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        <p className="text-slate-400">{claimStatus}</p>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'social' | 'magic' | 'email')} className="mt-4">
                        <TabsList className="grid w-full grid-cols-3 bg-slate-800/50">
                            <TabsTrigger value="social" className="data-[state=active]:bg-slate-700">
                                Social
                            </TabsTrigger>
                            <TabsTrigger value="magic" className="data-[state=active]:bg-slate-700">
                                Magic Link
                            </TabsTrigger>
                            <TabsTrigger value="email" className="data-[state=active]:bg-slate-700">
                                Email
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="social" className="space-y-3 mt-6">
                            {/* Passkey (Biometric) Button - Premium Option */}
                            <PasskeyButton mode="login" onSuccess={handleLoginSuccess} />

                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-700"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-slate-900 px-2 text-slate-500">Oppure</span>
                                </div>
                            </div>

                            <ProviderButton
                                provider="google"
                                onClick={handleGoogleSignIn}
                                loading={loading === 'google'}
                                disabled={loading !== null}
                            />
                            <ProviderButton
                                provider="apple"
                                onClick={handleAppleSignIn}
                                loading={loading === 'apple'}
                                disabled={loading !== null}
                            />

                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-700"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-slate-900 px-2 text-slate-500">Oppure</span>
                                </div>
                            </div>

                            <button
                                onClick={() => setActiveTab('email')}
                                className="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Usa Email e Password →
                            </button>
                        </TabsContent>

                        <TabsContent value="magic" className="mt-6">
                            <MagicLinkForm onSuccess={handleLoginSuccess} />
                        </TabsContent>

                        <TabsContent value="email" className="mt-6">
                            <EmailAuthForm onSuccess={handleLoginSuccess} />
                        </TabsContent>
                    </Tabs>
                )}

                <div className="mt-8 pt-6 border-t border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        Proseguendo, dichiari di aver letto la nostra{" "}
                        <Link href="/privacy" className="text-luxury-gold hover:underline">Informativa sulla Privacy</Link>
                        {" "}e di accettare i{" "}
                        <Link href="/terms" className="text-luxury-gold hover:underline">Termini di Servizio</Link>.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
