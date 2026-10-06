"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { COMPANY, COMPANY_FULL_ADDRESS, COMPANY_LEGAL_LINE } from '@/lib/company';

const H3 = "text-lg font-bold text-luxury-text/90 uppercase tracking-widest text-sm border-l-2 border-luxury-gold pl-4";
const MAIL_LINK = "text-luxury-gold hover:underline decoration-luxury-gold/30";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-luxury-bg text-luxury-text selection:bg-luxury-gold/30 selection:text-luxury-gold">
            {/* Background Atmosphere */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] ambient-glow ambient-glow-teal [--glow-alpha:5%] [--glow-blur:60px] md:[--glow-blur:120px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] ambient-glow ambient-glow-gold [--glow-blur:60px] md:[--glow-blur:120px]" />
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
                            Ultimo aggiornamento: 6 Ottobre 2026
                        </p>
                    </header>

                    {/* Content */}
                    <div className="prose prose-invert prose-luxury max-w-none space-y-10 text-luxury-text/80 leading-relaxed font-medium">
                        <p className="text-lg leading-relaxed first-letter:text-5xl first-letter:font-serif first-letter:text-luxury-gold first-letter:mr-3 first-letter:float-left">
                            La presente informativa privacy, resa ai sensi dell&apos;art. 13 del Regolamento generale sulla protezione dei dati UE 2016/679 (&quot;GDPR&quot;), contiene informazioni sul trattamento dei dati personali dell&apos;utente forniti durante la navigazione oppure in fase di compilazione di form presenti all&apos;interno del sito web (di seguito &quot;Sito web&quot;) come meglio specificato di seguito.
                        </p>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Il Titolare del trattamento</h2>
                            <p>
                                Titolare del trattamento è <strong>{COMPANY.legalName}</strong>, P.IVA {COMPANY.vatId}, con sede in {COMPANY_FULL_ADDRESS}.
                                Per qualsiasi richiesta relativa ai dati personali puoi scrivere a{' '}
                                <a href={`mailto:${COMPANY.email}`} className={MAIL_LINK}>{COMPANY.email}</a>{' '}
                                o telefonare al {COMPANY.phone}.
                            </p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Dati personali trattati</h2>
                            <div className="space-y-4">
                                <h3 className={H3}>a) Dati di navigazione</h3>
                                <p>
                                    I sistemi che fanno funzionare il Sito web acquisiscono alcuni dati la cui trasmissione è implicita nell&apos;uso di Internet (indirizzo IP, tipo di browser e dispositivo, pagine visitate, data e ora della richiesta). Li usiamo per garantire il funzionamento e la sicurezza del Sito, prevenire abusi e ricavare statistiche aggregate sull&apos;uso.
                                </p>
                                <p className="p-4 bg-luxury-teal/5 rounded-2xl border border-luxury-teal/10 italic text-sm">
                                    Con riferimento ai dati personali raccolti tramite cookie, si prega di prendere visione della <Link href="/cookie-policy" className="text-luxury-gold hover:underline decoration-luxury-gold/30">Cookie Policy</Link>.
                                </p>
                                <h3 className={`${H3} mt-8`}>b) Account utente</h3>
                                <p>
                                    Se crei un account: indirizzo e-mail, nome, eventuale foto profilo e, se scegli l&apos;accesso biometrico, la chiave pubblica della passkey. I dati biometrici restano sul tuo dispositivo e non ci vengono mai trasmessi.
                                </p>
                                <h3 className={`${H3} mt-8`}>c) Assistente virtuale, foto e preventivi</h3>
                                <p>
                                    I messaggi che scrivi all&apos;assistente virtuale, le foto e le planimetrie che carichi, i rendering generati e i dati delle richieste di preventivo: descrizione dei lavori, ambienti, metrature e i recapiti che decidi di lasciarci (nome, e-mail, telefono). Ti chiediamo di non inserire nella chat dati non necessari, in particolare dati sulla salute o dati di altre persone.
                                </p>
                                <h3 className={`${H3} mt-8`}>d) Recensioni</h3>
                                <p>
                                    Se lasci una recensione: nome, località, testo e valutazione. Vengono pubblicate sul Sito solo dopo la nostra approvazione.
                                </p>
                            </div>
                        </section>

                        <section className="space-y-8">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Finalità e basi giuridiche del trattamento</h2>
                            <div className="grid gap-6">
                                {[
                                    { purpose: "consentire la navigazione sul Sito web e la gestione dell'account;", basis: "esecuzione di un contratto o di misure precontrattuali richieste dall'utente (art. 6.1.b GDPR)." },
                                    { purpose: "rispondere alle richieste di informazioni e assistenza, anche tramite l'assistente virtuale basato su intelligenza artificiale;", basis: "misure precontrattuali richieste dall'utente (art. 6.1.b GDPR)." },
                                    { purpose: "elaborare rendering e preventivi e ricontattare l'utente per i lavori richiesti;", basis: "misure precontrattuali richieste dall'utente (art. 6.1.b GDPR)." },
                                    { purpose: "pubblicare le recensioni inviate dagli utenti;", basis: "consenso dell'utente, revocabile in qualsiasi momento (art. 6.1.a GDPR)." },
                                    { purpose: "proteggere il Sito da abusi, accessi automatizzati e attacchi informatici;", basis: "legittimo interesse del Titolare alla sicurezza del servizio (art. 6.1.f GDPR)." },
                                    { purpose: "misurare in forma aggregata l'uso e le prestazioni del Sito;", basis: "consenso dell'utente espresso tramite il banner cookie, ove richiesto (art. 6.1.a GDPR)." },
                                    { purpose: "adempiere agli obblighi di legge, contabili e fiscali;", basis: "obbligo legale (art. 6.1.c GDPR)." },
                                ].map((item, i) => (
                                    <div key={i} className="flex gap-4 items-start p-4 hover:bg-white/5 rounded-2xl transition-colors">
                                        <span className="text-luxury-gold font-serif italic text-xl">0{i + 1}.</span>
                                        <div className="text-sm pt-1 space-y-1">
                                            <p>{item.purpose}</p>
                                            <p className="text-luxury-text/60">Base giuridica: {item.basis}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-sm border-t border-luxury-gold/10 pt-6 text-luxury-text/60">
                                Il conferimento dei dati per account, assistente e preventivi è facoltativo, ma senza di essi non possiamo fornire il servizio richiesto. Non prendiamo decisioni basate unicamente su trattamenti automatizzati che producano effetti giuridici sull&apos;utente: i preventivi elaborati con l&apos;aiuto dell&apos;intelligenza artificiale sono stime indicative, verificate da una persona prima dell&apos;invio definitivo.
                            </p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Tempo di conservazione</h2>
                            <ul className="list-disc list-inside space-y-2 text-sm">
                                <li><strong>Account, conversazioni, foto e rendering</strong>: finché l&apos;account è attivo. Dopo 12 mesi di inattività ti avvisiamo via e-mail; a 13 mesi l&apos;account viene disattivato; a 24 mesi conversazioni e dati personali vengono cancellati o resi anonimi e l&apos;account eliminato. Puoi chiederne la cancellazione in qualsiasi momento.</li>
                                <li><strong>Richieste di preventivo</strong>: per il tempo necessario a gestire la richiesta e, se segue un contratto, per 10 anni come previsto dalla normativa civilistica e fiscale.</li>
                                <li><strong>Recensioni</strong>: finché restano pubblicate o fino alla revoca del consenso.</li>
                                <li><strong>Dati di navigazione e log di sicurezza</strong>: per il periodo strettamente necessario, di norma non oltre 12 mesi, salvo necessità di accertare illeciti.</li>
                            </ul>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Destinatari dei dati</h2>
                            <p>
                                I dati sono trattati da personale autorizzato del Titolare e da fornitori che agiscono come responsabili del trattamento (art. 28 GDPR):
                            </p>
                            <ul className="list-disc list-inside space-y-2 text-sm text-luxury-text/70">
                                <li>Google (Firebase Authentication, Cloud Firestore, Cloud Storage, App Check e reCAPTCHA, Cloud Run, Vertex AI / Gemini per l&apos;assistente virtuale e i rendering, Model Armor per il filtro dei contenuti, Gmail per l&apos;invio delle e-mail);</li>
                                <li>Vercel Inc. (hosting del Sito, Vercel Analytics e Speed Insights);</li>
                                <li>Pinecone Systems Inc. (ricerca nel prezzario usato per i preventivi; non riceve dati personali dell&apos;utente);</li>
                                <li>professionisti e consulenti (contabili, legali, amministrativi) e, se necessario, autorità ed enti pubblici in forza di legge.</li>
                            </ul>
                            <p className="text-sm">I dati non sono venduti né ceduti a terzi per finalità di marketing.</p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Trasferimento dei dati all&apos;estero</h2>
                            <p>
                                Alcuni fornitori hanno sede negli Stati Uniti o possono trattare dati fuori dall&apos;Unione Europea. In questi casi il trasferimento si basa sulla decisione di adeguatezza EU-US Data Privacy Framework, per i fornitori certificati, oppure sulle clausole contrattuali tipo approvate dalla Commissione Europea (art. 46 GDPR).
                            </p>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-2xl font-serif text-luxury-gold italic">Diritti dell&apos;interessato</h2>
                            <p>
                                Ai sensi degli artt. 15–22 del GDPR puoi in qualsiasi momento chiedere l&apos;accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento e la portabilità, e opporti al trattamento basato sul legittimo interesse. Se il trattamento si basa sul consenso, puoi revocarlo in qualsiasi momento, senza effetti sulla liceità del trattamento precedente. Per esercitare i tuoi diritti scrivi a{' '}
                                <a href={`mailto:${COMPANY.email}`} className={MAIL_LINK}>{COMPANY.email}</a>.
                            </p>
                            <p>
                                Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali (
                                <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" className={MAIL_LINK}>www.garanteprivacy.it</a>
                                ) o all&apos;autorità di controllo del Paese UE in cui risiedi o lavori.
                            </p>
                        </section>
                    </div>

                    <footer className="pt-20 border-t border-luxury-gold/10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                            <Link href="/cookie-policy" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Cookie Policy</Link>
                            <Link href="/terms" className="text-xs font-bold uppercase tracking-widest text-luxury-text/40 hover:text-luxury-gold transition-colors">Termini e Condizioni</Link>
                        </div>
                        <p className="text-xs text-luxury-text/60">&copy; {new Date().getFullYear()} {COMPANY_LEGAL_LINE}</p>
                    </footer>
                </motion.div>
            </main>
        </div>
    );
}
