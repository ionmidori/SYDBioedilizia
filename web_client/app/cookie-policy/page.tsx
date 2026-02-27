"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Cookie } from 'lucide-react';

export default function CookiePolicyPage() {
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
                        <Cookie className="w-5 h-5 text-luxury-gold" />
                        <span className="text-sm font-serif italic text-luxury-text/60">Syd Bioedilizia - Cookie Policy</span>
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
                            Cookie <span className="text-luxury-gold italic">Policy</span>
                        </h1>
                        <p className="mt-6 text-luxury-text/40 font-medium tracking-[0.2em] uppercase text-xs">
                            Syd Bioedilizia - Gestione Consenso Trasparente
                        </p>
                    </header>

                    {/* Content */}
                    <div className="prose prose-invert prose-luxury max-w-none space-y-10 text-luxury-text/80 leading-relaxed font-medium">
                        <p className="text-lg leading-relaxed">
                            Questo Sito utilizza cookie tecnici (necessari), e con il tuo consenso anche cookie analitici e di profilazione, utili rispettivamente per consentire funzionalità fondamentali, misurare le performance o fornirti indicazioni promozionali in linea con i tuoi interessi.
                        </p>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Cosa sono i cookie</h2>
                            <p>
                                I cookie sono piccoli file di testo che vengono automaticamente posizionati sul PC del navigatore all&apos;interno del browser. Essi contengono informazioni di base sulla navigazione in Internet e grazie al browser vengono riconosciuti ogni volta che l&apos;utente visita il sito.
                            </p>
                        </section>

                        <section className="space-y-8">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Le nostre Categorie</h2>

                            <div className="grid gap-6">
                                <CookieCategoryItem
                                    title="1. Cookie Tecnici (Necessari)"
                                    desc="Questi cookie non richiedono consenso e vengono installati automaticamente. Permettono al sito di funzionare correttamente (es. mantenimento della sessione)."
                                    required={true}
                                />
                                <CookieCategoryItem
                                    title="2. Cookie Funzionali"
                                    desc="Consentono di ricordare le preferenze selezionate durante la navigazione (es. lingua). Richiedono il tuo preventivo consenso."
                                />
                                <CookieCategoryItem
                                    title="3. Cookie Analitici"
                                    desc="Utilizzati per raccogliere informazioni statistiche sull&apos;uso del Sito in forma aggregata o non. Richiedono il preventivo consenso."
                                />
                                <CookieCategoryItem
                                    title="4. Cookie di Profilazione"
                                    desc="Utilizzati per raggruppare gli utenti in categorie omogenee per inviare messaggi pubblicitari in linea con i tuoi interessi."
                                />
                            </div>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Come gestire le tue preferenze</h2>
                            <p>
                                Puoi gestire le tue preferenze tramite il pop-up banner che appare al primo accesso o cliccando sull&apos;icona della gestione consenso presente in basso a sinistra in ogni pagina. Inoltre, puoi gestire i cookie direttamente dalle impostazioni del tuo browser:
                            </p>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none p-0">
                                <BrowserLink name="Google Chrome" url="https://support.google.com/chrome/answer/95647?hl=it" />
                                <BrowserLink name="Mozilla Firefox" url="https://support.mozilla.org/it/kb/Gestione%20dei%20cookie" />
                                <BrowserLink name="Safari" url="https://support.apple.com/it-it/guide/deployment/depf7d5714d4/web" />
                                <BrowserLink name="Microsoft Edge" url="https://support.microsoft.com/it-it/microsoft-edge/eliminare-i-cookie-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" />
                            </ul>
                            <div className="mt-8 p-6 bg-luxury-teal/5 border border-luxury-teal/10 rounded-3xl space-y-4">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-luxury-gold">Dettagli per Browser</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px] leading-relaxed opacity-60">
                                    <div className="space-y-2">
                                        <p className="font-bold">Firefox:</p>
                                        <p>Gestione: Pannello Privacy in Impostazioni. &Egrave; possibile inibire il tracciamento e gestire singolarmente i cookie di terze parti.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="font-bold">Safari:</p>
                                        <p>Gestione: Preferenze - Privacy. &Egrave; possibile bloccare tutti i cookie o rimuoverli selettivamente.</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <footer className="pt-20 border-t border-luxury-gold/10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                            <Link href="/privacy" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Privacy Policy</Link>
                            <Link href="/terms" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Termini e Condizioni</Link>
                        </div>
                        <p className="text-xs text-luxury-text/20">&copy; 2026 Syd Bioedilizia S.r.l. - P.IVA 12345678901</p>
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}

function CookieCategoryItem({ title, desc, required = false }: { title: string, desc: string, required?: boolean }) {
    return (
        <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] hover:border-luxury-gold/30 transition-all group">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-serif italic text-luxury-gold">{title}</h3>
                {required && <span className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold/40 border border-luxury-gold/20 px-3 py-1 rounded-full">Sempre Attivo</span>}
            </div>
            <p className="text-sm text-luxury-text/60 leading-relaxed">{desc}</p>
        </div>
    );
}

function BrowserLink({ name, url }: { name: string, url: string }) {
    return (
        <li>
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-luxury-teal/5 border border-luxury-teal/10 rounded-2xl hover:bg-luxury-teal/10 hover:border-luxury-gold/30 transition-all group"
            >
                <span className="text-sm font-bold opacity-70 group-hover:opacity-100">{name}</span>
                <ArrowLeft className="w-4 h-4 rotate-180 text-luxury-gold/40 group-hover:text-luxury-gold transition-colors" />
            </a>
        </li>
    );
}
