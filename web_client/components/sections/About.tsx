'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Leaf, Shield, Award, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function About() {
    return (
        <section id="about" className="py-24 bg-canvas relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 ambient-glow ambient-glow-teal [--glow-alpha:5%]" />
            <div className="absolute bottom-0 left-0 w-1/3 h-1/3 ambient-glow ambient-glow-gold" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                {/* Header. h1: this is /chi-siamo's only section, and its own page
                    heading — BrandLogo (Navbar/Footer) is an image, not a heading. */}
                <div className="text-center mb-16 space-y-4">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-serif font-bold text-ink"
                    >
                        Chi Siamo
                    </motion.h1>
                    <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        whileInView={{ opacity: 1, width: '100px' }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="h-1 bg-primary mx-auto"
                    />
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="text-xl md:text-2xl text-ink font-light max-w-3xl mx-auto"
                    >
                        Energia Giovane, Esperienza Solida
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

                    {/* Left Column: Main Story & Philosophy */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="space-y-10"
                    >
                        {/* Company Intro */}
                        <div className="prose prose-lg text-ink leading-relaxed font-light">
                            <p>
                                <span className="text-accent-ink wordmark">SYD BIOEDILIZIA</span>
                                &nbsp;è una realtà operativa in tutta la Provincia di Roma, nata per offrire a privati e aziende soluzioni edili complete e personalizzate.
                            </p>
                            <p className="mt-4">
                                Sebbene l&apos;azienda sia giovane, le nostre fondamenta sono storiche: il nostro lavoro si basa sulla competenza di un team di tecnici con <span className="text-ink font-medium">oltre 30 anni di esperienza</span> sul campo, supportati oggi dalle tecnologie più avanzate.
                            </p>
                        </div>

                        {/* Philosophy Box */}
                        <div className="bg-surface border border-line rounded-2xl p-8 backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Leaf className="w-24 h-24 text-primary-ink" />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-ink mb-4 flex items-center gap-3">
                                <Leaf className="w-6 h-6 text-primary-ink" />
                                La Nostra Filosofia
                            </h3>
                            <p className="text-ink mb-6 font-light">
                                Il nostro nome è una garanzia: siamo specialisti dell&apos;isolamento termico e del benessere abitativo. Utilizziamo esclusivamente materiali certificati che rispettano i <span className="text-accent-ink">Criteri Minimi Ambientali (CAM)</span>, privilegiando prodotti naturali e traspiranti.
                            </p>

                            <h4 className="font-serif font-bold text-accent-ink text-lg mb-4">Le nostre eccellenze tecniche:</h4>
                            <ul className="space-y-3">
                                <li className="flex items-start gap-3">
                                    <Award className="w-5 h-5 text-primary-ink mt-1 shrink-0" />
                                    <span className="text-sm text-ink"><strong>Sistemi a cappotto certificati:</strong> Siamo installatori qualificati secondo la norma UNI 11716.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-primary-ink mt-1 shrink-0" />
                                    <span className="text-sm text-ink"><strong>Sicurezza totale:</strong> Utilizziamo isolanti termoregolatori in Classe A1 (incombustibili).</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Sparkles className="w-5 h-5 text-primary-ink mt-1 shrink-0" />
                                    <span className="text-sm text-ink"><strong>Salubrità dell&apos;aria:</strong> Impieghiamo solo vernici naturali, inodori e lavabili.</span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    {/* Right Column: Services & CTA */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="space-y-10"
                    >
                        {/* What We Do */}
                        <div>
                            <h3 className="text-2xl font-serif font-bold text-ink mb-6 border-l-4 border-accent pl-4">
                                Cosa Facciamo: <br />
                                <span className="text-accent-ink">Costruzioni e Ristrutturazioni Chiavi in Mano</span>
                            </h3>
                            <p className="text-ink mb-6 font-light leading-relaxed">
                                Ci occupiamo di edilizia a 360°, dalla costruzione ex novo alla riqualificazione di appartamenti, ville, condomini, uffici e spazi commerciali. Gestiamo internamente ogni fase del cantiere grazie a personale qualificato.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    "Rifacimento tetti",
                                    "Impermeabilizzazioni",
                                    "Ristrutturazione Bagni",
                                    "Nuovi Impianti",
                                    "Posa Pavimenti",
                                    "Cartongesso Design",
                                    "Opere di Finitura",
                                    "Tinteggiatura Naturale"
                                ].map((service, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-primary-subtle border border-primary/10 hover:border-primary/30 transition-colors">
                                        <CheckCircle className="w-5 h-5 text-primary-ink" />
                                        <span className="text-sm text-ink font-medium">{service}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Why Choose Us */}
                        <div className="bg-surface p-8 rounded-2xl border border-line shadow-xs">
                            <h3 className="text-2xl font-serif font-bold text-ink mb-4">Perché Scegliere <span className="wordmark">SYD BIOEDILIZIA</span></h3>
                            <p className="text-ink mb-6 leading-relaxed">
                                Non offriamo solo lavorazioni di alta qualità. Ti supportiamo anche nella burocrazia, guidandoti nell&apos;accesso alle <strong>detrazioni fiscali</strong> e agli <strong>Ecobonus</strong> per interventi come l&apos;insufflaggio termico e la riqualificazione energetica.
                            </p>
                            <Button
                                className="w-full bg-primary hover:bg-primary-hover text-on-primary font-bold py-6 text-lg shadow-lg"
                                onClick={() => {
                                    window.location.href = 'tel:+393755463599';
                                }}
                            >
                                Richiedi Sopralluogo Gratuito
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

