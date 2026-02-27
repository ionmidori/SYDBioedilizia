"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Settings, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookieCategory } from '@/lib/cookie-manager';

export function CookieConsent() {
    const { consent, isInitialized, acceptAll, declineAll, updateConsent } = useCookieConsent();
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

    if (!isInitialized) return null;

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
                    <div className="w-full max-w-4xl glass-premium !bg-slate-900/95 p-6 md:p-8 rounded-[2rem] border-luxury-gold/20 shadow-2xl pointer-events-auto relative overflow-hidden group">
                        {/* Atmospheric Background Element */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-luxury-gold/5 rounded-full blur-3xl pointer-events-none group-hover:bg-luxury-gold/10 transition-all duration-700" />

                        {!showSettings ? (
                            <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                                <div className="bg-luxury-gold/10 p-4 rounded-2xl border border-luxury-gold/20 shadow-inner">
                                    <ShieldCheck className="w-8 h-8 text-luxury-gold" />
                                </div>

                                <div className="flex-1 text-center md:text-left">
                                    <h3 className="text-xl font-bold text-luxury-text font-serif mb-1">
                                        Gestione della <span className="text-luxury-gold italic">Privacy</span>
                                    </h3>
                                    <p className="text-sm text-luxury-text/60 leading-relaxed max-w-2xl">
                                        Utilizziamo i cookie per migliorare la tua esperienza e analizzare il traffico.
                                        Puoi accettare tutti i cookie o personalizzare le tue preferenze. Leggi i nostri <Link href="/terms" target="_blank" className="text-luxury-gold hover:underline">Termini di Servizio</Link>, l&apos;<Link href="/privacy" target="_blank" className="text-luxury-gold hover:underline">Informativa sulla Privacy</Link> e la <Link href="/cookie-policy" target="_blank" className="text-luxury-gold hover:underline">Cookie Policy</Link>.
                                    </p>
                                </div>

                                <div className="flex flex-wrap justify-center gap-3">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowSettings(true)}
                                        className="text-luxury-gold hover:bg-luxury-gold/10 font-bold uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl transition-all"
                                    >
                                        <Settings className="w-4 h-4 mr-2" />
                                        Personalizza
                                    </Button>
                                    <Button
                                        onClick={acceptAll}
                                        className="bg-luxury-teal hover:bg-luxury-teal/90 text-white font-bold uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl shadow-lg shadow-luxury-teal/20 transition-all hover:scale-[1.02] active:scale-95 border border-white/10"
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
                                <div className="flex items-center justify-between border-b border-luxury-gold/10 pb-4">
                                    <h3 className="text-xl font-bold text-luxury-text font-serif">
                                        Impostazioni <span className="text-luxury-gold italic">Avanzate</span>
                                    </h3>
                                    <button onClick={() => setShowSettings(false)} className="text-luxury-text/40 hover:text-luxury-gold transition-colors">
                                        <X className="w-6 h-6" />
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
                                        className="text-luxury-text/60 hover:text-red-400 hover:bg-red-950/10 font-bold uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl"
                                    >
                                        Rifiuta Opzionali
                                    </Button>
                                    <Button
                                        onClick={handleSaveSettings}
                                        className="bg-luxury-gold hover:bg-luxury-gold text-luxury-bg font-bold uppercase tracking-widest text-[10px] h-12 px-10 rounded-xl shadow-lg shadow-luxury-gold/20 transition-all border border-white/10"
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
    return (
        <div
            onClick={onClick}
            className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${active
                ? 'bg-luxury-gold/10 border-luxury-gold/30 shadow-inner'
                : 'bg-white/5 border-white/5 hover:border-white/10'
                } ${locked ? 'cursor-default opacity-80' : 'hover:scale-[1.02]'}`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-bold uppercase tracking-wider ${active ? 'text-luxury-gold' : 'text-luxury-text/40'}`}>
                    {title}
                </span>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${active ? 'bg-luxury-gold border-luxury-gold text-luxury-bg shadow-glow-gold' : 'border-white/20 text-transparent'
                    }`}>
                    <Check className="w-3 h-3 stroke-[4]" />
                </div>
            </div>
            <p className="text-[10px] text-luxury-text/50 leading-snug">{desc}</p>
        </div>
    );
}

