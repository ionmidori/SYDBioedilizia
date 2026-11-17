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

const FOCUS_VISIBLE_MARGIN_PX = 24;

function centerFocusedFieldIfObscured(container: HTMLElement | null): void {
    if (!container || typeof document === 'undefined') return;
    const target = document.activeElement;
    if (
        !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) ||
        !container.contains(target)
    ) {
        return;
    }
    const cRect = container.getBoundingClientRect();
    if (cRect.height <= 0) return;
    const tRect = target.getBoundingClientRect();
    if (tRect.top >= cRect.top + FOCUS_VISIBLE_MARGIN_PX && tRect.bottom <= cRect.bottom - FOCUS_VISIBLE_MARGIN_PX) {
        return;
    }
    // Adjust only the inner scroll panel (never window or Vaul's outer sheet)
    const desiredScrollTop = container.scrollTop + (tRect.top - cRect.top) - (cRect.height - tRect.height) / 2;
    container.scrollTop = Math.max(0, desiredScrollTop);
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
    const [activeTab, setActiveTab] = useState<'social' | 'email'>('social');
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
    const drawerContentRef = useRef<HTMLDivElement | null>(null);
    const drawerScrollRef = useRef<HTMLDivElement | null>(null);
    const focusRevealTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!open || isDesktop) return;
        const vv = window.visualViewport;
        let rafId: number | null = null;
        const onViewportResize = () => {
            centerFocusedFieldIfObscured(drawerScrollRef.current);
            if (rafId !== null) window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                const sheet = drawerContentRef.current;
                // Wait a frame (after Vaul's own resize handler) so when resizes-content shrinks
                // innerHeight alongside visualViewport, or the keyboard closes, we clear Vaul's
                // inline height lock and let CSS `h-auto` / `max-h-[90dvh]` re-expand the sheet.
                if (sheet && (!vv || Math.abs(window.innerHeight - vv.height) <= 60)) {
                    sheet.style.height = '';
                }
                centerFocusedFieldIfObscured(drawerScrollRef.current);
            });
        };
        window.addEventListener('resize', onViewportResize);
        vv?.addEventListener('resize', onViewportResize);
        return () => {
            window.removeEventListener('resize', onViewportResize);
            vv?.removeEventListener('resize', onViewportResize);
            if (rafId !== null) window.cancelAnimationFrame(rafId);
            if (focusRevealTimerRef.current !== null) {
                window.clearTimeout(focusRevealTimerRef.current);
                focusRevealTimerRef.current = null;
            }
        };
    }, [open, isDesktop]);

    const scheduleDrawerFocusReveal = () => {
        if (!open || isDesktop) return;
        centerFocusedFieldIfObscured(drawerScrollRef.current);
        if (focusRevealTimerRef.current !== null) {
            window.clearTimeout(focusRevealTimerRef.current);
        }
        focusRevealTimerRef.current = window.setTimeout(() => {
            centerFocusedFieldIfObscured(drawerScrollRef.current);
            focusRevealTimerRef.current = null;
        }, 350);
    };

    const tabs = [
        { id: 'social', label: 'Social' },
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
        <div className="px-6 pt-2 pb-5">
            <div className="text-center mb-4 md:mb-5">
                {/* The mark is decorative: the dialog title (sr-only, below) already names the brand. */}
                <BrandLogo variant="mark" decorative className="h-8 md:h-9 mx-auto mb-2.5" />
                <p className="text-2xl md:text-3xl font-serif font-bold text-ink mb-1.5">
                    Benvenuto in SYD
                </p>
                <p className="text-ink-muted font-sans text-xs md:text-sm tracking-wide">
                    Accedi per salvare preventivi, render e progetti
                </p>
            </div>

            <div className="space-y-4">
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
                                "flex-1 relative py-2.5 md:py-2 text-xs font-medium tracking-wide z-10 transition-colors duration-200",
                                activeTab === tab.id ? "text-ink" : "text-ink-muted hover:text-ink"
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

                <div role="tabpanel" id={panelId} aria-labelledby={tabId(activeTab)}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ type: "spring", stiffness: 120, damping: 12 }}
                        >
                            {activeTab === 'social' && (
                                <div className="space-y-3">
                                    {/* Luxury Biometric Button */}
                                    <div className="relative group">
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-accent via-accent-subtle to-accent rounded-xl opacity-40 blur-md group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
                                        <div className="relative">
                                            <PasskeyButton mode="login" onSuccess={handleLoginSuccess} className="h-12" />
                                        </div>
                                    </div>

                                    <div className="relative my-3">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-line" />
                                        </div>
                                        <div className="relative flex justify-center text-xs tracking-[0.2em] font-normal text-ink-subtle uppercase">
                                            <span className="bg-surface backdrop-blur-md px-2">Oppure</span>
                                        </div>
                                    </div>

                                    <div className="grid gap-3">
                                        <ProviderButton
                                            provider="google"
                                            onClick={handleGoogleSignIn}
                                            loading={loading === 'google'}
                                            disabled={loading !== null}
                                            className="h-12 bg-surface-muted border-line hover:bg-surface text-ink hover:scale-[1.01] transition-transform duration-200"
                                        />
                                    </div>

                                    <div className="pt-3 border-t border-line">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('email')}
                                            className="w-full min-h-[44px] group relative inline-flex items-center justify-center rounded-lg text-sm text-accent-ink hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                                        >
                                            <span>Usa Email e Password</span>
                                            <span className="absolute -bottom-1 left-0 w-0 h-px bg-accent transition-all group-hover:w-full" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'email' && (
                                <div className="bg-surface p-3.5 rounded-2xl border border-line">
                                    <EmailAuthForm onSuccess={handleLoginSuccess} />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-line text-center">
                <p className="text-xs text-ink-subtle leading-relaxed">
                    Proseguendo, accetti i{" "}
                    <Link href="/terms" className="text-ink-muted hover:text-accent-ink transition-colors underline decoration-line underline-offset-2">Termini di Servizio</Link>
                    {" "}e l&apos;{" "}
                    <Link href="/privacy" className="text-ink-muted hover:text-accent-ink transition-colors underline decoration-line underline-offset-2">Informativa sulla Privacy</Link>.
                </p>
            </div>
        </div>
    );

    const bgGlow = (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none" />
    );

    const closeBar = (
        <div className="relative z-20 flex w-full shrink-0 justify-center pt-1.5">
            <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-w-11 min-h-7 px-3 flex items-center justify-center rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring cursor-pointer active:scale-95 group"
                aria-label="Chiudi"
            >
                <span className="w-12 h-1.5 bg-line-strong rounded-full group-hover:bg-ink-subtle transition-colors" />
            </button>
        </div>
    );

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className={cn(
                    "flex flex-col gap-0 w-[calc(100%-2rem)] sm:max-w-md max-h-[calc(100dvh-5rem)] p-0 overflow-hidden border-line bg-surface backdrop-blur-xl",
                    "rounded-tl-[32px] rounded-tr-[12px] rounded-bl-[12px] rounded-br-[32px]",
                    "shadow-2xl shadow-shade/50",
                    "[&>button]:hidden"
                )}>
                    {bgGlow}
                    <DialogTitle className="sr-only">Benvenuto in SYD</DialogTitle>
                    <DialogDescription className="sr-only">Effettua l&apos;accesso per salvare i tuoi progetti</DialogDescription>
                    {closeBar}
                    <div className="relative z-10 overflow-y-auto flex-1 min-h-0">
                        {content}
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent
                ref={drawerContentRef}
                className={cn(
                // overflow-clip (not overflow-hidden): `hidden` is a scroll container that includes
                // Vaul's 200% ::after backdrop, allowing focus/taps to scroll the whole sheet upwards.
                // Bound the sheet itself with dvh (not inner svh) so Android resizes-content shrinks
                // it with the keyboard before Vaul computes offsetFromTop.
                "p-0 max-h-[90dvh] overflow-clip border-t border-line bg-surface backdrop-blur-xl",
                "rounded-t-[32px]",
                "shadow-2xl shadow-shade/50",
                "[&>div:first-child]:hidden" // Hide Vaul's default drag indicator — we render our own notch
            )}>
                {bgGlow}
                <DrawerTitle className="sr-only">Benvenuto in SYD</DrawerTitle>
                <DrawerDescription className="sr-only">Effettua l&apos;accesso per salvare i tuoi progetti</DrawerDescription>
                {closeBar}
                <div
                    ref={drawerScrollRef}
                    onFocusCapture={scheduleDrawerFocusReveal}
                    className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain pb-safe"
                >
                    {content}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
