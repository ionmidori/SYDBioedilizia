"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Home, LayoutGrid } from 'lucide-react';

// A new key: whoever saw the tour of the projects sees the house once.
const TOUR_KEY = 'syd_house_tour_completed';

const STEPS = [
    {
        icon: Home,
        title: 'La tua casa',
        text: 'Hai una sola chat per tutte le stanze: racconta a SYD cosa vuoi fare in bagno, in cucina o in salotto, nella stessa conversazione.',
    },
    {
        icon: LayoutGrid,
        title: 'Le schede della casa',
        text: 'In alto trovi Chat, Media, Preventivo e Casa: foto e render per stanza, il preventivo da inviare al team e i dettagli della casa.',
    },
] as const;

function tourSeen(): boolean {
    try {
        return localStorage.getItem(TOUR_KEY) === 'true';
    } catch {
        return true; // No storage: never nag on every visit.
    }
}

/** A first look at the house on a phone (Phase 139); on desktop the tabs are on screen. */
export function OnboardingTour() {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (tourSeen() || window.innerWidth >= 768) return;
        // Small delay to allow UI to settle
        const timer = setTimeout(() => setIsVisible(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleComplete = () => {
        try {
            localStorage.setItem(TOUR_KEY, 'true');
        } catch {
            // No storage: the tour simply shows again next time.
        }
        setIsVisible(false);
    };

    const isLast = step === STEPS.length - 1;
    const { icon: Icon, title, text } = STEPS[step];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="onboarding-title"
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="w-full max-w-sm bg-luxury-bg border border-luxury-gold/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                    >
                        {/* Background Decoration */}
                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-luxury-gold/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                            <div className="p-4 bg-luxury-gold/10 rounded-2xl border border-luxury-gold/20 mb-2">
                                <Icon aria-hidden="true" className="w-12 h-12 text-luxury-gold" />
                            </div>
                            <h2 id="onboarding-title" className="text-2xl font-bold text-luxury-text font-serif">
                                {title}
                            </h2>
                            <p className="text-luxury-text/70 text-sm leading-relaxed">{text}</p>

                            <div className="pt-4 w-full space-y-2">
                                <button
                                    type="button"
                                    onClick={() => (isLast ? handleComplete() : setStep(step + 1))}
                                    className="w-full flex items-center justify-center gap-2 py-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl shadow-lg shadow-luxury-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    {isLast ? 'Inizia' : 'Avanti'}
                                    <ChevronRight aria-hidden="true" className="w-5 h-5" />
                                </button>
                                {!isLast && (
                                    <button
                                        type="button"
                                        onClick={handleComplete}
                                        className="w-full min-h-11 text-xs font-bold uppercase tracking-widest text-luxury-text/50 hover:text-luxury-text"
                                    >
                                        Salta
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
