"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function PrivacyPage() {
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
                        <ShieldCheck className="w-5 h-5 text-luxury-gold" />
                        <span className="text-sm font-serif italic text-luxury-text/60">Syd Bioedilizia - Legal</span>
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
                            Privacy <span className="text-luxury-gold italic">Policy</span>
                        </h1>
                        <p className="mt-6 text-luxury-text/40 font-medium tracking-[0.2em] uppercase text-xs">
                            Ultimo aggiornamento: 30 Gennaio 2026
                        </p>
                    </header>

                    {/* Content */}
                    <div className="prose prose-invert prose-luxury max-w-none space-y-10 text-luxury-text/80 leading-relaxed font-medium">
                        <p className="text-lg leading-relaxed first-letter:text-5xl first-letter:font-serif first-letter:text-luxury-gold first-letter:mr-3 first-letter:float-left">
                            La presente informativa privacy, resa ai sensi dell&apos;art. 13 del Regolamento generale sulla protezione dei dati UE 2016/679 (&quot;GDPR&quot;), contiene informazioni sul trattamento dei dati personali dell&apos;utente forniti durante la navigazione oppure in fase di compilazione di form presenti all&apos;interno del sito web (di seguito &quot;Sito web&quot;) come meglio specificato di seguito.
                        </p>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Il Titolare del trattamento</h2>
                            <p>I dati del Titolare del trattamento nonché i dati di contatto sono specificati all&apos;interno del Sito web.</p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Dati personali trattati</h2>
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-luxury-text/90 uppercase tracking-widest text-sm border-l-2 border-luxury-gold pl-4">a) Dati di navigazione</h3>
                                <p>
                                    I sistemi informatici e le procedure software preposte al funzionamento del Sito web possono acquisire, nel corso del loro normale esercizio, alcuni dati personali la cui trasmissione è implicita nell&apos;uso dei protocolli di comunicazione di Internet... Questi dati vengono utilizzati al solo fine di ricavare informazioni statistiche sull&apos;uso del Sito web e per controllarne il corretto funzionamento.
                                </p>
                                <p className="p-4 bg-luxury-teal/5 rounded-2xl border border-luxury-teal/10 italic text-sm">
                                    Con riferimento ai dati personali raccolti tramite cookie, si prega di prendere visione della <Link href="/cookie-policy" className="text-luxury-gold hover:underline decoration-luxury-gold/30">Cookie Policy</Link>.
                                </p>
                                <h3 className="text-lg font-bold text-luxury-text/90 uppercase tracking-widest text-sm border-l-2 border-luxury-gold pl-4 mt-8">b) Altri dati volontariamente forniti dall&apos;utente</h3>
                                <p>
                                    Il Titolare del trattamento potrà trattare anche ulteriori dati personali quali ad esempio nome, cognome, indirizzo e-mail, numero di telefono, dati di pagamento ed eventuali ulteriori dati spontaneamente conferiti ad esempio durante la compilazione di form presenti nel Sito web.
                                </p>
                            </div>
                        </section>

                        <section className="space-y-8">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Finalità e basi giuridiche del trattamento</h2>
                            <div className="grid gap-6">
                                {[
                                    "consentire la navigazione sul Sito web ed erogare i servizi web e le funzionalità richieste;",
                                    "gestire e rispondere alle richieste di informazione/assistenza (anche tramite AI/chatbot);",
                                    "creare una area riservata all'interno del Sito web;",
                                    "fornire preventivi e prenotazioni (anche tramite sistemi di intelligenza artificiale);",
                                    "consentire la procedura di acquisto di prodotti e servizi."
                                ].map((item, i) => (
                                    <div key={i} className="flex gap-4 items-start p-4 hover:bg-white/5 rounded-2xl transition-colors">
                                        <span className="text-luxury-gold font-serif italic text-xl">0{i + 1}.</span>
                                        <p className="text-sm pt-1">{item}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-sm border-t border-luxury-gold/10 pt-6 opacity-60">
                                La base giuridica delle predette finalità è l&apos;esecuzione di un contratto di cui l&apos;utente è parte o l&apos;esecuzione di misure precontrattuali adottate su sua richiesta. Il conferimento dei dati personali in tali casi è necessario.
                            </p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Tempo di conservazione</h2>
                            <p>
                                Il Titolare del trattamento conserva i dati personali per il tempo necessario al conseguimento delle finalità per le quali sono stati raccolti... In generale per tutta la durata del rapporto contrattuale e per non oltre 10 anni successivi alla cessazione del medesimo.
                            </p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Categorie di destinatari dei dati</h2>
                            <p>
                                Il Titolare del trattamento può comunicare i dati personali a soggetti esterni che operano in qualità di titolari del trattamento oppure che trattano i dati personali in qualità di responsabili del trattamento (art. 28 GDPR). Tra i destinatari figurano:
                            </p>
                            <ul className="list-disc list-inside space-y-2 text-sm opacity-70">
                                <li>Professionisti e studi di consulenza (contabile, legale, amministrativa);</li>
                                <li>Banche e istituti di credito;</li>
                                <li>Società terze di intelligenza artificiale per l&apos;erogazione dei servizi del Sito;</li>
                                <li>Autorità ed enti pubblici in forza di disposizioni di legge.</li>
                            </ul>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Trasferimento dei dati all&apos;estero</h2>
                            <p>
                                In caso di trasferimento dati fuori dall&apos;UE in paesi senza una Decisione di Adeguatezza, il Titolare si impegna ad adottare clausole contrattuali tipo (art. 46 GDPR) e misure supplementari tecniche e organizzative per garantire un livello di protezione equivalente a quello dell&apos;Unione Europea.
                            </p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Diritti dell&apos;interessato</h2>
                            <p>
                                Ai sensi degli artt. 15 - 22 del GDPR l&apos;interessato potrà in qualunque momento esercitare i suoi diritti (accesso, rettifica, cancellazione, limitazione, opposizione). Per esercitare tali diritti, è possibile inviare una richiesta all&apos;indirizzo e-mail del Titolare del trattamento.
                            </p>
                        </section>
                    </div>

                    <footer className="pt-20 border-t border-luxury-gold/10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                            <Link href="/cookie-policy" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Cookie Policy</Link>
                            <Link href="/terms" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Termini e Condizioni</Link>
                        </div>
                        <p className="text-xs text-luxury-text/20">&copy; 2026 Syd Bioedilizia S.r.l. - P.IVA 12345678901</p>
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}
