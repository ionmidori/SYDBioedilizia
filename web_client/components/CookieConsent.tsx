"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Settings, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookieCategory } from '@/lib/cookie-manager';

export function CookieConsent() {
    const { consent, isInitialized, acceptAll, declineAll, updateConsent } = useCookieConsent();
    // The admin console only uses essential (sign-in) cookies and its dialogs
    // sit where the banner appears: never show it there.
    const isAdminRoute = usePathname()?.startsWith('/admin') ?? false;
    const [showSettings, setShowSettings] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // local state for settings modal
    const [tempConsent, setTempConsent] = useState<Record<CookieCategory, boolean>>({
        essential: true,
        analytics: false,
        marketing: false,
    });

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isInitialized && !consent) {
            // Small delay for cinematic feel
            timer = setTimeout(() => setIsVisible(true), 1500);
        } else {
            // Use timeout to avoid sync setState warning in effect body
            timer = setTimeout(() => setIsVisible(false), 0);
        }
        return () => clearTimeout(timer);
    }, [consent, isInitialized]);

    const handleSaveSettings = () => {
        updateConsent(tempConsent);
        setShowSettings(false);
        setIsVisible(false);
    };

    const toggleCategory = (cat: CookieCategory) => {
        if (cat === 'essential') return;
        setTempConsent(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    if (!isInitialized || isAdminRoute) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-6 inset-x-6 z-[200] flex justify-center pointer-events-none"
                >
                    <div className="w-full max-w-4xl glass !bg-canvas/95 p-6 md:p-8 rounded-[2rem] border-line shadow-2xl pointer-events-auto relative overflow-hidden group">
                        {/* Atmospheric Background Element */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent-subtle rounded-full blur-3xl pointer-events-none group-hover:bg-accent-subtle transition-all duration-700" />

                        {!showSettings ? (
                            <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                                <div className="bg-accent-subtle p-4 rounded-2xl border border-line shadow-inner">
                                    <ShieldCheck className="w-8 h-8 text-accent-ink" />
                                </div>

                                <div className="flex-1 text-center md:text-left">
                                    <h3 className="text-xl font-bold text-ink font-serif mb-1">
                                        Gestione della <span className="text-accent-ink italic">Privacy</span>
                                    </h3>
                                    <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                                        Utilizziamo i cookie per migliorare la tua esperienza e analizzare il traffico.
                                        Puoi accettare tutti i cookie o personalizzare le tue preferenze. Leggi i nostri <Link href="/terms" target="_blank" className="text-accent-ink underline underline-offset-2 hover:decoration-2">Termini di Servizio</Link>, l&apos;<Link href="/privacy" target="_blank" className="text-accent-ink underline underline-offset-2 hover:decoration-2">Informativa sulla Privacy</Link> e la <Link href="/cookie-policy" target="_blank" className="text-accent-ink underline underline-offset-2 hover:decoration-2">Cookie Policy</Link>.
                                    </p>
                                </div>

                                <div className="flex flex-wrap justify-center gap-3">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowSettings(true)}
                                        className="text-accent-ink hover:bg-accent-subtle font-bold uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl transition-all"
                                    >
                                        <Settings className="w-4 h-4 mr-2" />
                                        Personalizza
                                    </Button>
                                    <Button
                                        onClick={acceptAll}
                                        className="bg-primary hover:bg-primary-hover text-on-primary font-bold uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 border border-line"
                                    >
                                        Accetta Tutti
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="relative z-10 space-y-6"
                            >
                                <div className="flex items-center justify-between border-b border-line pb-4">
                                    <h3 className="text-xl font-bold text-ink font-serif">
                                        Impostazioni <span className="text-accent-ink italic">Avanzate</span>
                                    </h3>
                                    <button type="button" onClick={() => setShowSettings(false)} aria-label="Chiudi le impostazioni" className="text-ink-muted hover:text-accent-ink transition-colors rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                        <X className="w-6 h-6" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <CategoryToggle
                                        title="Essenziali"
                                        desc="Necessari per il corretto funzionamento."
                                        active={tempConsent.essential}
                                        locked={true}
                                        onClick={() => { }}
                                    />
                                    <CategoryToggle
                                        title="Analitici"
                                        desc="Utilizzati per monitorare il traffico."
                                        active={tempConsent.analytics}
                                        onClick={() => toggleCategory('analytics')}
                                    />
                                    <CategoryToggle
                                        title="Marketing"
                                        desc="Utilizzati per annunci personalizzati."
                                        active={tempConsent.marketing}
                                        onClick={() => toggleCategory('marketing')}
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <Button
                                        variant="ghost"
                                        onClick={declineAll}
                                        className="text-ink-muted hover:text-danger-ink hover:bg-danger-subtle font-bold uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl"
                                    >
                                        Rifiuta Opzionali
                                    </Button>
                                    <Button
                                        onClick={handleSaveSettings}
                                        className="bg-accent hover:bg-accent/90 text-on-accent font-bold uppercase tracking-widest text-[10px] h-12 px-10 rounded-xl shadow-lg transition-all border border-line"
                                    >
                                        Salva Preferenze
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function CategoryToggle({ title, desc, active, onClick, locked = false }: { title: string, desc: string, active: boolean, onClick: () => void, locked?: boolean }) {
    // A native toggle button: focusable, operable with Enter/Space, and its state
    // (aria-pressed) is announced. A locked category is on and cannot change.
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            disabled={locked}
            className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${active
                ? 'bg-accent-subtle border-line shadow-inner'
                : 'bg-surface border-line-strong'
                } ${locked ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02]'}`}
        >
            <span className="flex items-center justify-between mb-2">
                <span className={`text-sm font-bold uppercase tracking-wider ${active ? 'text-accent-ink' : 'text-ink-muted'}`}>
                    {title}
                </span>
                {/* The mark is drawn only when on: forced-colors mode would reveal a transparent one. */}
                <span aria-hidden="true" className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${active ? 'bg-accent border-accent text-on-accent' : 'border-line-strong'
                    }`}>
                    {active && <Check className="w-3 h-3 stroke-[4]" />}
                </span>
            </span>
            <span className="block text-[10px] text-ink-muted leading-snug">{desc}</span>
        </button>
    );
}

