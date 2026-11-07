"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import { COMPANY_LEGAL_LINE } from '@/lib/company';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-canvas text-ink selection:bg-accent/30 selection:text-accent-ink">
            {/* Background Atmosphere */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] ambient-glow ambient-glow-teal [--glow-alpha:5%] [--glow-blur:60px] md:[--glow-blur:120px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] ambient-glow ambient-glow-gold [--glow-blur:60px] md:[--glow-blur:120px]" />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 glass-premium border-b border-line px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-accent-ink hover:text-ink transition-colors group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-xs font-bold uppercase tracking-widest">Torna alla Home</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-accent-ink" />
                        <span className="text-sm font-serif italic text-ink-muted">Syd Bioedilizia - Termini</span>
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
                    <header className="border-b border-line pb-12">
                        <h1 className="text-5xl md:text-7xl font-bold font-serif tracking-tight leading-tight">
                            Termini di <span className="text-accent-ink italic">Servizio</span>
                        </h1>
                        <p className="mt-6 text-ink-subtle font-medium tracking-[0.2em] uppercase text-xs">
                            Ultimo aggiornamento: Gennaio 2026
                        </p>
                    </header>

                    <div className="prose prose-invert prose-luxury max-w-none space-y-10 text-ink leading-relaxed font-medium">
                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-accent-ink italic">1. Accettazione dei Termini</h2>
                            <p>
                                Accedendo o utilizzando il sito web di Syd Bioedilizia, l&apos;utente accetta di essere vincolato dai presenti Termini di Servizio e da tutte le leggi e i regolamenti applicabili.
                            </p>
                        </section>

                        <section className="space-y-6 text-center py-20 border border-line rounded-[3rem] bg-surface">
                            <p className="text-xl font-serif italic text-accent-ink">Sezione in fase di aggiornamento legale.</p>
                            <p className="text-sm opacity-40">I contenuti completi dei Termini di Servizio saranno disponibili a breve.</p>
                        </section>
                    </div>

                    <footer className="pt-20 border-t border-line flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                            <Link href="/privacy" className="text-xs font-bold uppercase tracking-widest text-ink-subtle hover:text-accent-ink transition-colors">Privacy Policy</Link>
                            <Link href="/cookie-policy" className="text-xs font-bold uppercase tracking-widest text-ink-subtle hover:text-accent-ink transition-colors">Cookie Policy</Link>
                        </div>
                        <p className="text-xs text-ink-muted">&copy; {new Date().getFullYear()} {COMPANY_LEGAL_LINE}</p>
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}
