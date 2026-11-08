'use client';

import { useState, useEffect, useId, useRef, type KeyboardEvent } from 'react';
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
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { mapAuthError } from '@/utils/auth-utils';

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
    const { loginWithGoogle, user } = useAuth();

    useEffect(() => {
        if (open) {
            logger.debug('[AuthDialog] 🟢 Opened. User state:', {
                uid: user?.uid,
                isAnonymous: user?.isAnonymous,
            });
        }
    }, [open, user]);

    const [loading, setLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'social' | 'magic' | 'email'>('social');
    const tabsId = useId();
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // The user stays on the page it signed in from. Every login path already
    // brought the guest's chats along (lib/auth/guest-claim.ts); a failure
    // stays on screen in GuestClaimNotice.
    const handleLoginSuccess = () => {
        onOpenChange(false);
    };

    // Phones / PWA / in-app browsers may leave for the provider (redirect): the
    // login then completes in AuthProvider when the page loads again.
    const handleGoogleSignIn = async () => {
        if (loading) return;
        setLoading('google');
        try {
            const outcome = await loginWithGoogle();
            if (outcome === 'redirecting') return;
            handleLoginSuccess();
        } catch (error) {
            const code = (error as { code?: string })?.code ?? 'unknown';
            if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
                console.error('[AuthDialog] Google login failed:', code, error);
                alert(mapAuthError(code));
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

    // WAI-ARIA Tabs: one tab stop for the list; arrows, Home and End move and select.
    const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const last = tabs.length - 1;
        const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        setActiveTab(tabs[next].id);
        tabRefs.current[next]?.focus();
    };
    const tabId = (id: string) => `${tabsId}-tab-${id}`;
    const panelId = `${tabsId}-panel`;

    // Shared inner content — identical on both mobile and desktop
    const content = (
        <div className="relative z-10 p-6 pt-10">
            <div className="text-center mb-8">
                {/* The mark is decorative: the dialog title (sr-only, below) already names the brand. */}
                <BrandLogo variant="mark" decorative className="h-10 mx-auto mb-4" />
                <p className="text-3xl md:text-4xl font-serif font-bold text-ink mb-2">
                    Benvenuto in SYD
                </p>
                <p className="text-ink-muted font-sans text-sm tracking-wide">
                    Accedi all&apos;ecosistema premium
                </p>
            </div>

                <div className="space-y-6">
                    {/* M3 Segmented Control */}
                    <div role="tablist" aria-label="Metodo di accesso" className="bg-surface-muted p-1 rounded-xl flex relative">
                        {tabs.map((tab, index) => (
                            <button
                                key={tab.id}
                                ref={(el) => { tabRefs.current[index] = el; }}
                                type="button"
                                role="tab"
                                id={tabId(tab.id)}
                                aria-selected={activeTab === tab.id}
                                aria-controls={panelId}
                                tabIndex={activeTab === tab.id ? 0 : -1}
                                onClick={() => setActiveTab(tab.id)}
                                onKeyDown={(e) => onTabKeyDown(e, index)}
                                className={cn(
                                    "flex-1 relative py-2.5 text-xs font-medium tracking-wide z-10 transition-colors duration-200",
                                    activeTab === tab.id ? "text-ink" : "text-ink-muted hover:text-ink-muted"
                                )}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-surface rounded-lg shadow-sm border border-line"
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                {/* Positioned, so it paints above the (absolutely positioned) highlight. */}
                                <span className="relative">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="min-h-[300px]" role="tabpanel" id={panelId} aria-labelledby={tabId(activeTab)}>
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
                                            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent via-accent-subtle to-accent rounded-xl opacity-40 blur-md group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
                                            <div className="relative">
                                                <PasskeyButton mode="login" onSuccess={handleLoginSuccess} />
                                            </div>
                                        </div>

                                        <div className="relative my-6">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-line" />
                                            </div>
                                            <div className="relative flex justify-center text-[10px] tracking-[0.2em] font-medium text-ink-subtle uppercase">
                                                <span className="bg-surface backdrop-blur-md px-2">Oppure</span>
                                            </div>
                                        </div>

                                        <div className="grid gap-3">
                                            <ProviderButton
                                                provider="google"
                                                onClick={handleGoogleSignIn}
                                                loading={loading === 'google'}
                                                disabled={loading !== null}
                                                className="h-14 bg-surface-muted border-line hover:bg-surface text-ink hover:scale-[1.01] transition-transform duration-200"
                                            />
                                        </div>

                                        <div className="relative my-6">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-line" />
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setActiveTab('email')}
                                            className="w-full group relative inline-flex items-center justify-center text-sm text-accent-ink hover:text-accent-ink transition-colors"
                                        >
                                            <span>Usa Email e Password</span>
                                            <span className="absolute -bottom-1 left-0 w-0 h-px bg-accent transition-all group-hover:w-full" />
                                        </button>
                                    </div>
                                )}

                                {activeTab === 'magic' && (
                                    <div className="bg-surface p-4 rounded-2xl border border-line">
                                        <MagicLinkForm onSuccess={handleLoginSuccess} />
                                    </div>
                                )}

                                {activeTab === 'email' && (
                                    <div className="bg-surface p-4 rounded-2xl border border-line">
                                        <EmailAuthForm onSuccess={handleLoginSuccess} />
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

            <div className="mt-6 pt-6 border-t border-line text-center">
                <p className="text-[10px] text-ink-subtle leading-relaxed font-medium">
                    Proseguendo, accetti i nostri{" "}
                    <Link href="/terms" className="text-ink-muted hover:text-accent-ink transition-colors underline decoration-line underline-offset-2">Termini</Link>
                    {" "}e la{" "}
                    <Link href="/privacy" className="text-ink-muted hover:text-accent-ink transition-colors underline decoration-line underline-offset-2">Privacy Policy</Link>.
                </p>
            </div>
        </div>
    );

    // Shared shell decorations (notch + bg glow) — same on both surfaces
    const shellDecorations = (
        <>
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none" />
            <div className="absolute top-0 left-0 w-full flex justify-center pt-3 pb-1 z-50">
                <button
                    onClick={() => onOpenChange(false)}
                    className="w-12 h-1.5 bg-line-strong rounded-full hover:bg-ink-subtle transition-colors cursor-pointer active:scale-95"
                    aria-label="Chiudi"
                />
            </div>
        </>
    );

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className={cn(
                    "sm:max-w-md p-0 overflow-hidden border-line bg-surface backdrop-blur-xl",
                    "rounded-tl-[32px] rounded-tr-[12px] rounded-bl-[12px] rounded-br-[32px]",
                    "shadow-2xl shadow-shade/50",
                    "[&>button]:hidden"
                )}>
                    {shellDecorations}
                    <DialogTitle className="sr-only">Benvenuto in SYD</DialogTitle>
                    <DialogDescription className="sr-only">Effettua l&apos;accesso per salvare i tuoi progetti</DialogDescription>
                    {content}
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className={cn(
                "p-0 overflow-hidden border-t border-line bg-surface backdrop-blur-xl",
                "rounded-t-[32px]",
                "shadow-2xl shadow-shade/50",
                "[&>div:first-child]:hidden" // Hide Vaul's default drag indicator — we render our own notch
            )}>
                {shellDecorations}
                <DrawerTitle className="sr-only">Benvenuto in SYD</DrawerTitle>
                <DrawerDescription className="sr-only">Effettua l&apos;accesso per salvare i tuoi progetti</DrawerDescription>
                <div className="overflow-y-auto max-h-[90svh] pb-safe">
                    {content}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
