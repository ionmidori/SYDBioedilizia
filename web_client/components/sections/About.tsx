'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Leaf, Shield, Award, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function About() {
    return (
        <section id="about" className="py-24 bg-luxury-bg relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-luxury-teal/5 rounded-full blur-[100px]" />
            <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-luxury-gold/5 rounded-full blur-[100px]" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                {/* Header */}
                <div className="text-center mb-16 space-y-4">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-serif font-bold text-luxury-gold"
                    >
                        Chi Siamo
                    </motion.h2>
                    <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        whileInView={{ opacity: 1, width: '100px' }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="h-1 bg-luxury-teal mx-auto"
                    />
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="text-xl md:text-2xl text-luxury-text font-light max-w-3xl mx-auto"
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
                        <div className="prose prose-invert prose-lg text-luxury-text/80 leading-relaxed font-light">
                            <p>
                                <span className="text-luxury-gold font-medium font-trajan tracking-tight">SYD BIOEDILIZIA</span>
                                &nbsp;è una realtà operativa in tutta la Provincia di Roma, nata per offrire a privati e aziende soluzioni edili complete e personalizzate.
                            </p>
                            <p className="mt-4">
                                Sebbene l&apos;azienda sia giovane, le nostre fondamenta sono storiche: il nostro lavoro si basa sulla competenza di un team di tecnici con <span className="text-luxury-text font-medium">oltre 30 anni di esperienza</span> sul campo, supportati oggi dalle tecnologie più avanzate.
                            </p>
                        </div>

                        {/* Philosophy Box */}
                        <div className="bg-white/5 border border-luxury-gold/10 rounded-2xl p-8 backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Leaf className="w-24 h-24 text-luxury-teal" />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-luxury-text mb-4 flex items-center gap-3">
                                <Leaf className="w-6 h-6 text-luxury-teal" />
                                La Nostra Filosofia
                            </h3>
                            <p className="text-luxury-text/80 mb-6 font-light">
                                Il nostro nome è una garanzia: siamo specialisti dell&apos;isolamento termico e del benessere abitativo. Utilizziamo esclusivamente materiali certificati che rispettano i <span className="text-luxury-gold">Criteri Minimi Ambientali (CAM)</span>, privilegiando prodotti naturali e traspiranti.
                            </p>

                            <h4 className="font-serif font-bold text-luxury-gold text-lg mb-4">Le nostre eccellenze tecniche:</h4>
                            <ul className="space-y-3">
                                <li className="flex items-start gap-3">
                                    <Award className="w-5 h-5 text-luxury-teal mt-1 shrink-0" />
                                    <span className="text-sm text-luxury-text/80"><strong>Sistemi a cappotto certificati:</strong> Siamo installatori qualificati secondo la norma UNI 11716.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-luxury-teal mt-1 shrink-0" />
                                    <span className="text-sm text-luxury-text/80"><strong>Sicurezza totale:</strong> Utilizziamo isolanti termoregolatori in Classe A1 (incombustibili).</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Sparkles className="w-5 h-5 text-luxury-teal mt-1 shrink-0" />
                                    <span className="text-sm text-luxury-text/80"><strong>Salubrità dell&apos;aria:</strong> Impieghiamo solo vernici naturali, inodori e lavabili.</span>
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
                            <h3 className="text-2xl font-serif font-bold text-luxury-text mb-6 border-l-4 border-luxury-gold pl-4">
                                Cosa Facciamo: <br />
                                <span className="text-luxury-gold">Costruzioni e Ristrutturazioni Chiavi in Mano</span>
                            </h3>
                            <p className="text-luxury-text/80 mb-6 font-light leading-relaxed">
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
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-luxury-teal/5 border border-luxury-teal/10 hover:border-luxury-teal/30 transition-colors">
                                        <CheckCircle className="w-5 h-5 text-luxury-teal" />
                                        <span className="text-sm text-luxury-text/90 font-medium">{service}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Why Choose Us */}
                        <div className="bg-gradient-to-br from-luxury-gold/10 to-transparent p-8 rounded-2xl border border-luxury-gold/20">
                            <h3 className="text-2xl font-serif font-bold text-luxury-gold mb-4">Perché Scegliere <span className="font-trajan tracking-tight">SYD BIOEDILIZIA</span></h3>
                            <p className="text-luxury-text/80 mb-6 leading-relaxed">
                                Non offriamo solo lavorazioni di alta qualità. Ti supportiamo anche nella burocrazia, guidandoti nell&apos;accesso alle <strong>detrazioni fiscali</strong> e agli <strong>Ecobonus</strong> per interventi come l&apos;insufflaggio termico e la riqualificazione energetica.
                            </p>
                            <Button
                                variant="premium"
                                className="w-full bg-luxury-gold hover:bg-luxury-gold/80 text-luxury-bg font-bold py-6 text-lg shadow-lg shadow-luxury-gold/20"
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

