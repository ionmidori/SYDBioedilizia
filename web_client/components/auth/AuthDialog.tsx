'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerContent,
    DrawerTitle,
    DrawerDescription,
} from '@/components/ui/drawer';
import { ProviderButton } from './ProviderButton';
import { EmailAuthForm } from './EmailAuthForm';
import { MagicLinkForm } from './MagicLinkForm';
import { PasskeyButton } from './PasskeyButton';
import { useAuth } from '@/hooks/useAuth';
import { useSessionId } from '@/hooks/useSessionId';
import { useMediaQuery } from '@/hooks/use-media-query';
import { projectsApi } from '@/lib/projects-api';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    redirectOnLogin?: boolean;
}

export function AuthDialog({ open, onOpenChange, redirectOnLogin = true }: AuthDialogProps) {
    const { loginWithGoogle, loginWithApple, logout, user } = useAuth();
    const sessionId = useSessionId();
    const router = useRouter();

    // Track initial state when dialog opens to distinguish "just logged in" from "already logged in"
    const userWasAnonymousRef = useRef(user?.isAnonymous ?? true);

    useEffect(() => {
        if (open) {
            userWasAnonymousRef.current = user?.isAnonymous ?? true;
        }
    }, [open, user?.isAnonymous]);

    useEffect(() => {
        if (open) {
            console.log('[AuthDialog] 🟢 Opened. User state:', {
                uid: user?.uid,
                isAnonymous: user?.isAnonymous,
                redirectOnLogin
            });
        }
    }, [open, user, redirectOnLogin]);

    useEffect(() => {
        // This effect handles auto-closing the dialog after a successful login,
        // but only if the user was previously anonymous and is now authenticated.
        const justLoggedIn = userWasAnonymousRef.current && user && !user.isAnonymous;

        if (open && justLoggedIn) {
            console.log('[AuthDialog] 🔴 Auto-Closing: Transition to authenticated complete');
            const timer = setTimeout(() => {
                onOpenChange(false);
                if (redirectOnLogin) {
                    router.push('/dashboard');
                }
            }, 1500); // 1.5s delay to show final feedback if any
            return () => clearTimeout(timer);
        }
    }, [open, user, onOpenChange, router, redirectOnLogin, userWasAnonymousRef]);

    const [loading, setLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'social' | 'magic' | 'email'>('social');
    const [claimStatus, setClaimStatus] = useState<'pending' | 'error' | null>(null);

    const handleLoginSuccess = async () => {
        // Keep dialog open during claim so the user sees progress and any errors.
        setClaimStatus('pending');
        try {
            if (sessionId) {
                await projectsApi.claimProject(sessionId);
                // Clear anonymous session key from localStorage only after a confirmed claim.
                // Prevents stale sessionId from being re-claimed by the next user on this device.
                localStorage.removeItem('chatSessionId');
            }
        } catch (error) {
            console.warn('[AuthDialog] Claim failed:', error);
            // Show the error briefly so the user knows their anonymous work wasn't linked.
            setClaimStatus('error');
            await new Promise(resolve => setTimeout(resolve, 2500));
        } finally {
            setClaimStatus(null);
            // The auto-close effect will handle closing the dialog and redirecting.
            // We don't close it here directly to allow the auto-close effect to trigger
            // after the claim status has been shown.
        }
    };

    const handleGoogleSignIn = async () => {
        if (loading) return;
        setLoading('google');
        try {
            await loginWithGoogle();
            await handleLoginSuccess();
        } catch (error) {
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
            await handleLoginSuccess();
        } catch (error) {
            const err = error as { code?: string };
            if (err.code !== 'auth/popup-closed-by-user') {
                alert('Errore durante il login con Apple. Riprova.');
            }
        } finally {
            setLoading(null);
        }
    };

    const isDesktop = useMediaQuery('(min-width: 768px)');

    const tabs = [
        { id: 'social', label: 'Social' },
        { id: 'magic', label: 'Magic Link' },
        { id: 'email', label: 'Email' },
    ] as const;

    // Shared inner content — identical on both mobile and desktop
    const content = (
        <div className="relative z-10 p-6 pt-10">
            <div className="text-center mb-8">
                <p className="text-3xl md:text-4xl font-trajan text-white mb-2 drop-shadow-md">
                    Benvenuto in SYD
                </p>
                <p className="text-slate-400 font-sans text-sm tracking-wide">
                    Accedi all'ecosistema premium
                </p>
            </div>

            {claimStatus ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    {claimStatus === 'pending' ? (
                        <>
                            <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
                            <p className="text-slate-300 font-medium">Finalizzazione...</p>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="w-8 h-8 text-amber-400" />
                            <div className="text-center space-y-1">
                                <p className="text-slate-200 font-semibold text-sm">Accesso completato</p>
                                <p className="text-slate-400 text-xs max-w-[240px] leading-relaxed">
                                    La sessione anonima non è stata collegata. Il tuo account è attivo, ma i dati precedenti potrebbero non essere disponibili.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {/* M3 Segmented Control */}
                    <div className="bg-black/20 p-1 rounded-xl flex relative">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex-1 relative py-2.5 text-xs font-medium tracking-wide z-10 transition-colors duration-200",
                                    activeTab === tab.id ? "text-white" : "text-slate-400 hover:text-slate-300"
                                )}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-white/10 rounded-lg shadow-sm border border-white/5"
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="min-h-[300px]">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ type: "spring", stiffness: 120, damping: 12 }}
                            >
                                {activeTab === 'social' && (
                                    <div className="space-y-4">
                                        {/* Luxury Biometric Button */}
                                        <div className="relative group">
                                            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#C9A84C] via-[#E6C97F] to-[#C9A84C] rounded-xl opacity-75 blur group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt" />
                                            <div className="relative">
                                                <PasskeyButton mode="login" onSuccess={handleLoginSuccess} />
                                            </div>
                                        </div>

                                        <div className="relative my-6">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-white/10" />
                                            </div>
                                            <div className="relative flex justify-center text-[10px] tracking-[0.2em] font-medium text-slate-500 uppercase">
                                                <span className="bg-slate-900/50 backdrop-blur-md px-2">Oppure</span>
                                            </div>
                                        </div>

                                        <div className="grid gap-3">
                                            <ProviderButton
                                                provider="google"
                                                onClick={handleGoogleSignIn}
                                                loading={loading === 'google'}
                                                disabled={loading !== null}
                                                className="h-14 bg-slate-800/50 border-white/5 hover:bg-slate-800 text-white hover:scale-[1.01] transition-transform duration-200"
                                            />
                                            <ProviderButton
                                                provider="apple"
                                                onClick={handleAppleSignIn}
                                                loading={loading === 'apple'}
                                                disabled={loading !== null}
                                                className="h-14 bg-white/5 border-white/5 hover:bg-white/10 text-white hover:scale-[1.01] transition-transform duration-200"
                                            />
                                        </div>

                                        <div className="relative my-6">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-white/10" />
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setActiveTab('email')}
                                            className="w-full group relative inline-flex items-center justify-center text-sm text-luxury-gold/80 hover:text-luxury-gold transition-colors"
                                        >
                                            <span>Usa Email e Password</span>
                                            <span className="absolute -bottom-1 left-0 w-0 h-px bg-luxury-gold transition-all group-hover:w-full" />
                                        </button>
                                    </div>
                                )}

                                {activeTab === 'magic' && (
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                        <MagicLinkForm onSuccess={handleLoginSuccess} />
                                    </div>
                                )}

                                {activeTab === 'email' && (
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                        <EmailAuthForm onSuccess={handleLoginSuccess} />
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            )}

            <div className="mt-6 pt-6 border-t border-white/5 text-center">
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Proseguendo, accetti i nostri{" "}
                    <Link href="/terms" className="text-slate-400 hover:text-luxury-gold transition-colors underline decoration-slate-700 underline-offset-2">Termini</Link>
                    {" "}e la{" "}
                    <Link href="/privacy" className="text-slate-400 hover:text-luxury-gold transition-colors underline decoration-slate-700 underline-offset-2">Privacy Policy</Link>.
                </p>
            </div>
        </div>
    );

    // Shared shell decorations (notch + bg glow) — same on both surfaces
    const shellDecorations = (
        <>
            <div className="absolute inset-0 bg-gradient-to-br from-luxury-gold/5 via-transparent to-blue-500/5 pointer-events-none" />
            <div className="absolute top-0 left-0 w-full flex justify-center pt-3 pb-1 z-50">
                <button
                    onClick={() => onOpenChange(false)}
                    className="w-12 h-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors cursor-pointer active:scale-95"
                    aria-label="Chiudi"
                />
            </div>
        </>
    );

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className={cn(
                    "sm:max-w-md p-0 overflow-hidden border-white/10 bg-slate-900/80 backdrop-blur-xl",
                    "rounded-tl-[32px] rounded-tr-[12px] rounded-bl-[12px] rounded-br-[32px]",
                    "shadow-2xl shadow-black/50",
                    "[&>button]:hidden"
                )}>
                    {shellDecorations}
                    <DialogTitle className="sr-only">Benvenuto in SYD</DialogTitle>
                    <DialogDescription className="sr-only">Effettua l'accesso per salvare i tuoi progetti</DialogDescription>
                    {content}
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className={cn(
                "p-0 overflow-hidden border-t border-white/10 bg-slate-900/95 backdrop-blur-xl",
                "rounded-t-[32px]",
                "shadow-2xl shadow-black/50",
                "[&>div:first-child]:hidden" // Hide Vaul's default drag indicator — we render our own notch
            )}>
                {shellDecorations}
                <DrawerTitle className="sr-only">Benvenuto in SYD</DrawerTitle>
                <DrawerDescription className="sr-only">Effettua l'accesso per salvare i tuoi progetti</DrawerDescription>
                <div className="overflow-y-auto max-h-[90svh] pb-safe">
                    {content}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
