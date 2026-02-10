"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, X, ChevronRight } from 'lucide-react';

export function OnboardingTour() {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const hasSeenTour = localStorage.getItem('syd_dashboard_tour_completed');

        // Only show if not seen and on mobile
        const isMobile = window.innerWidth < 768; // Simple check, or use hook

        if (!hasSeenTour && isMobile) {
            // Small delay to allow UI to settle
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleComplete = () => {
        localStorage.setItem('syd_dashboard_tour_completed', 'true');
        setIsVisible(false);
    };

    const handleNext = () => {
        if (step < 1) {
            setStep(step + 1);
        } else {
            handleComplete();
        }
    };

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
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="w-full max-w-sm bg-luxury-bg border border-luxury-gold/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                    >
                        {/* Background Decoration */}
                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-luxury-gold/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="relative z-10 flex flex-col items-center text-center space-y-6">

                            {step === 0 ? (
                                <>
                                    <div className="p-4 bg-luxury-gold/10 rounded-2xl border border-luxury-gold/20 mb-2">
                                        <Hand className="w-12 h-12 text-luxury-gold animate-pulse" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-luxury-text font-serif">
                                        Benvenuto in <span className="text-luxury-gold">SYD</span>
                                    </h2>
                                    <p className="text-luxury-text/70 leading-relaxed">
                                        Abbiamo aggiornato la navigazione per renderla più fluida e naturale su mobile.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="relative h-32 w-full flex items-center justify-center">
                                        {/* Swipe Animation Logic */}
                                        <motion.div
                                            animate={{ x: [-40, 40, -40] }}
                                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                            className="absolute"
                                        >
                                            <Hand className="w-16 h-16 text-luxury-gold drop-shadow-[0_0_15px_rgba(212,175,55,0.5)]" />
                                        </motion.div>
                                        <div className="flex justify-between w-full px-8 opacity-30">
                                            <div className="w-12 h-20 border-2 border-dashed border-luxury-text rounded-lg" />
                                            <div className="w-12 h-20 border-2 border-dashed border-luxury-text rounded-lg" />
                                        </div>
                                    </div>
                                    <h2 className="text-xl font-bold text-luxury-text font-serif">
                                        Scorri per Navigare
                                    </h2>
                                    <p className="text-luxury-text/70 text-sm leading-relaxed">
                                        Fai swipe a <strong>destra</strong> per i tuoi progetti e a <strong>sinistra</strong> per la galleria globale.
                                    </p>
                                </>
                            )}

                            <div className="pt-4 w-full">
                                <button
                                    onClick={handleNext}
                                    className="w-full flex items-center justify-center gap-2 py-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl shadow-lg shadow-luxury-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    {step === 0 ? "Scopri come funziona" : "Inizia Subito"}
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
