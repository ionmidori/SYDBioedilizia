'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { M3Spring } from '@/lib/m3-motion';
import { Button } from '@/components/ui/button';
import { StatCounter } from '@/components/ui/stat-counter';
import { PlayCircle, Palette, FileText } from 'lucide-react';
import { Portfolio } from './Portfolio';
import { SlideShowModal } from './SlideShowModal';

export function Hero() {
    const [isSlideShowOpen, setIsSlideShowOpen] = useState(false);

    return (
        <section className="relative min-h-[100dvh] flex items-center pt-20 pb-12 md:pb-16 overflow-hidden bg-luxury-bg">
            {/* Background Elements - Luxury Tech */}
            <div className="absolute inset-0 bg-luxury-bg z-0" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-luxury-teal/10 rounded-full atmospheric-blur-optimized -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-luxury-gold/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            {/* Three grid items so the portfolio can sit between the intro and the CTAs
                below lg, and in its own right-hand column spanning both from lg up.
                auto/1fr rows: the portfolio is the tallest item, and the extra height goes
                under the CTAs rather than between them and the intro. */}
            <div className="container mx-auto px-4 md:px-6 relative z-10 grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] gap-x-12 gap-y-10 items-start">

                {/* Intro */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={M3Spring.gentle}
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-luxury-bg border border-luxury-gold/30 text-white text-xs font-semibold uppercase tracking-wider mb-8 shadow-sm shadow-luxury-gold/10">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-luxury-gold opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-luxury-gold"></span>
                        </span>
                        La Nuova Era della Ristrutturazione
                    </div>

                    {/* Headline */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-luxury-text leading-[1.2] mb-6">
                        Realizza la <br />
                        <span className="text-luxury-gold italic relative">
                            Casa dei Sogni
                            <span className="absolute -bottom-2 left-0 w-full h-1 bg-luxury-teal/30 rounded-full blur-sm"></span>
                        </span>
                        <br /> con <span className="font-trajan tracking-tight">SYD BIOEDILIZIA</span>
                    </h1>

                    <p className="text-lg md:text-xl text-luxury-text/80 max-w-xl leading-relaxed font-light">
                        Ristruttura il tuo appartamento in maniera tradizionale o in bioedilizia. Dall&apos;idea alla realtà in pochi click. Ottieni preventivi veloci, visualizzazioni 3D fotorealistiche e un team di esperti pronto a realizzare il tuo progetto.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, ...M3Spring.standard }}
                    className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2"
                >
                    <Portfolio />
                </motion.div>

                {/* CTAs + stats */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, ...M3Spring.gentle }}
                    className="lg:col-start-1 lg:row-start-2"
                >
                    <div className="flex flex-col gap-6 mb-12">
                        {/* Primary CTA - Quote */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-lg shadow-lg shadow-luxury-teal/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 active:shadow-none"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT');
                                    window.dispatchEvent(event);
                                }}
                            >
                                Richiedi Preventivo Gratuito
                                <FileText className="ml-2 w-5 h-5" />
                            </Button>
                        </div>

                        {/* Secondary CTA - Rendering */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-lg shadow-lg shadow-luxury-teal/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 active:shadow-none"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT');
                                    window.dispatchEvent(event);
                                }}
                            >
                                Crea Rendering Gratuito
                                <Palette className="ml-2 w-5 h-5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold/10 hover:border-luxury-gold rounded-lg transition-all duration-200 active:scale-95 active:bg-luxury-gold/20"
                                onClick={() => setIsSlideShowOpen(true)}
                            >
                                <PlayCircle className="mr-2 w-5 h-5" />
                                Guarda come funziona
                            </Button>
                        </div>
                    </div>

                    {/* Stats - Luxury Style */}
                    <div className="grid grid-cols-3 gap-6 border-t border-luxury-gold/20 pt-8">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-luxury-text">
                                <StatCounter value={100} suffix="+" />
                            </h4>
                            <p className="text-sm text-luxury-text/60">Progetti Completati</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-luxury-text">
                                <StatCounter value={24} suffix="h" />
                            </h4>
                            <p className="text-sm text-luxury-text/60">Tempo Preventivo</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-luxury-text">
                                <StatCounter value={4.9} decimals={1} suffix="/5" />
                            </h4>
                            <p className="text-sm text-luxury-text/60">Soddisfazione Clienti</p>
                        </div>
                    </div>
                </motion.div>

            </div>

            {/* Modal */}
            <SlideShowModal isOpen={isSlideShowOpen} onClose={() => setIsSlideShowOpen(false)} />
        </section>
    );
}
