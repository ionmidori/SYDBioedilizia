"use client";

import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import { useCompanyIdentity } from '@/components/providers/CompanyIdentityProvider';
import { fullAddress, legalLine, mailtoHref } from '@/lib/company-info/format';
import { M3Duration, M3EasingFM } from '@/lib/m3-motion';

const MAIL_LINK = "text-accent-ink hover:underline decoration-accent-ink";

export function TermsClient() {
    const reduceMotion = useReducedMotion();
    const identity = useCompanyIdentity();
    return (
        <div className="min-h-screen bg-canvas text-ink selection:bg-accent/30 selection:text-accent-ink">
            {/* Background Atmosphere */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] ambient-glow ambient-glow-teal [--glow-alpha:5%] [--glow-blur:60px] md:[--glow-blur:120px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] ambient-glow ambient-glow-gold [--glow-blur:60px] md:[--glow-blur:120px]" />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 glass border-b border-line px-6 py-4">
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
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: M3Duration.medium1, ease: M3EasingFM.decelerate }}
                    className="space-y-12"
                >
                    {/* Header */}
                    <header className="border-b border-line pb-12">
                        <h1 className="text-5xl md:text-7xl font-bold font-serif tracking-tight leading-tight">
                            Termini di <span className="text-primary-ink italic">Servizio</span>
                        </h1>
                        <p className="mt-6 text-ink-subtle font-medium tracking-[0.2em] uppercase text-xs">
                            Ultimo aggiornamento: Novembre 2026
                        </p>
                    </header>

                    <div className="prose max-w-3xl space-y-10 text-ink leading-relaxed font-normal">
                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">1. Titolare e Oggetto del Servizio</h2>
                            <p>
                                Accedendo o utilizzando il presente sito web, l&apos;utente accetta i presenti Termini di Servizio.
                                {identity ? (
                                    <>
                                        {' '}Il sito e i servizi digitali connessi sono gestiti da <strong>{identity.legal_name}</strong>, P.IVA {identity.vat_id}, con sede in {fullAddress(identity)} (contatto e-mail:{' '}
                                        <a href={mailtoHref(identity.email)} className={MAIL_LINK}>{identity.email}</a>).
                                    </>
                                ) : (
                                    ' Il sito e i servizi digitali connessi sono gestiti dal titolare indicato nella sezione legale e nella scheda societaria.'
                                )}
                            </p>
                            <p>
                                Il sito consente agli utenti di consultare informazioni sui servizi edili, esplorare progetti realizzati, dialogare con l&apos;assistente digitale e inviare richieste preliminari di stima e contatto.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">2. Natura Indicativa di Render AI e Bozze di Preventivo</h2>
                            <p>
                                I rendering generati tramite intelligenza artificiale hanno finalità esclusivamente esplorative e illustrative: non costituiscono progettazione esecutiva, verifica strutturale né impegno contrattuale circa materiali o resa finale in cantiere.
                            </p>
                            <p>
                                Le bozze di preventivo generate tramite il sito rappresentano stime preliminari indicative e non sono giuridicamente vincolanti. La formulazione del preventivo definitivo avviene solo dopo revisione tecnica interna e successivo sopralluogo gratuito in loco.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">3. Area Operativa</h2>
                            <p>
                                I servizi di progettazione esecutiva, ristrutturazione, bioedilizia e direzione lavori sono offerti esclusivamente nel territorio di Roma e della Città metropolitana di Roma Capitale. Eventuali richieste relative ad altre aree geografiche potranno essere declinate senza obbligo di esecuzione.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">4. Account Utente, Caricamento Immagini e Uso Lecito</h2>
                            <p>
                                L&apos;utente è responsabile dell&apos;accuratezza dei dati forniti e garantisce di avere il diritto di caricare foto, planimetrie e descrizioni relative agli immobili oggetto di richiesta. È vietato caricare contenuti illeciti, lesivi di diritti di terzi, dati sensibili non pertinenti o tentare accessi automatizzati e abusi delle risorse AI.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">5. Proprietà Intellettuale</h2>
                            <p>
                                Testi, fotografie di cantiere, marchi, interfaccia grafica, codice software e contenuti editoriali pubblicati sul sito restano di proprietà esclusiva del Titolare o dei rispettivi aventi diritto. Ne è vietata la riproduzione o l&apos;utilizzo commerciale senza preventiva autorizzazione scritta.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">6. Limitazione di Responsabilità e Forza Maggiore</h2>
                            <p>
                                Il Titolare si impegna a mantenere il sito aggiornato e accessibile, senza tuttavia garantire l&apos;assenza di interruzioni tecniche o manutenzioni programmate. Salvo i casi di dolo o colpa grave, il Titolare non risponde di ritardi o indisponibilità dovuti a cause di forza maggiore, fornitori terzi o rete dell&apos;utente.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-serif text-accent-ink italic">7. Privacy, Cookie e Legge Applicabile</h2>
                            <p>
                                Il trattamento dei dati personali e l&apos;uso dei cookie sono regolati rispettivamente dalla{' '}
                                <Link href="/privacy" className={MAIL_LINK}>Privacy Policy</Link> e dalla{' '}
                                <Link href="/cookie-policy" className={MAIL_LINK}>Cookie Policy</Link>.
                                I presenti Termini sono disciplinati dalla legge italiana; per qualsiasi controversia, fatti salvi i fori inderogabili previsti dal Codice del Consumo, è competente in via esclusiva il Foro di Roma.
                            </p>
                        </section>
                    </div>

                    <footer className="pt-20 border-t border-line flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                            <Link href="/privacy" className="text-xs font-bold uppercase tracking-widest text-ink-subtle hover:text-accent-ink transition-colors">Privacy Policy</Link>
                            <Link href="/cookie-policy" className="text-xs font-bold uppercase tracking-widest text-ink-subtle hover:text-accent-ink transition-colors">Cookie Policy</Link>
                        </div>
                        {identity && <p className="text-xs text-ink-muted">&copy; {new Date().getFullYear()} {legalLine(identity)}</p>}
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}
