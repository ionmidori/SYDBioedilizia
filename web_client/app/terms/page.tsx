"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-luxury-bg text-luxury-text selection:bg-luxury-gold/30 selection:text-luxury-gold">
            {/* Background Atmosphere */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-luxury-teal/5 rounded-full atmospheric-blur-optimized" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-luxury-gold/5 rounded-full atmospheric-blur-optimized" />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 glass-premium border-b border-white/5 px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-luxury-gold hover:text-luxury-text transition-colors group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-xs font-bold uppercase tracking-widest">Torna alla Home</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-luxury-gold" />
                        <span className="text-sm font-serif italic text-luxury-text/60">Syd Bioedilizia - Termini</span>
                    </div>
                </div>
            </nav>

            <main className="max-w-4xl mx-auto px-6 py-20 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-12"
                >
                    {/* Header */}
                    <header className="border-b border-luxury-gold/10 pb-12">
                        <h1 className="text-5xl md:text-7xl font-bold font-serif tracking-tight leading-tight">
                            Termini di <span className="text-luxury-gold italic">Servizio</span>
                        </h1>
                        <p className="mt-6 text-luxury-text/40 font-medium tracking-[0.2em] uppercase text-xs">
                            Ultimo aggiornamento: Gennaio 2026
                        </p>
                    </header>

                    <div className="prose prose-invert prose-luxury max-w-none space-y-10 text-luxury-text/80 leading-relaxed font-medium">
                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">1. Accettazione dei Termini</h2>
                            <p>
                                Accedendo o utilizzando il sito web di Syd Bioedilizia, l&apos;utente accetta di essere vincolato dai presenti Termini di Servizio e da tutte le leggi e i regolamenti applicabili.
                            </p>
                        </section>

                        <section className="space-y-6 text-center py-20 border border-white/5 rounded-[3rem] bg-white/5">
                            <p className="text-xl font-serif italic text-luxury-gold">Sezione in fase di aggiornamento legale.</p>
                            <p className="text-sm opacity-40">I contenuti completi dei Termini di Servizio saranno disponibili a breve.</p>
                        </section>
                    </div>

                    <footer className="pt-20 border-t border-luxury-gold/10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                            <Link href="/privacy" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Privacy Policy</Link>
                            <Link href="/cookie-policy" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Cookie Policy</Link>
                        </div>
                        <p className="text-xs text-luxury-text/20">&copy; 2026 Syd Bioedilizia S.r.l. - P.IVA 12345678901</p>
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}
