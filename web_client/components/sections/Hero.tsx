'use client';

import { motion } from 'framer-motion';
import { M3Spring } from '@/lib/m3-motion';
import { Button } from '@/components/ui/button';
import { StatCounter } from '@/components/ui/stat-counter';
import { Palette, FileText } from 'lucide-react';
import { Portfolio } from './Portfolio';
import { openChat } from '@/lib/chat-events';
import type { PortfolioItem } from '@/lib/portfolio';

/** `portfolio`: server-rendered real projects from `getPortfolio()` (app/page.tsx). */
export function Hero({ portfolio }: { portfolio?: PortfolioItem[] }) {
    return (
        // overflow-clip, not overflow-hidden: a hidden box is still programmatically
        // scrollable, so the "Progetti" anchor (#portfolio lives in here) scrolled the
        // hero itself and hid the h1 for good. clip crops the glows the same way but
        // only lets the page scroll.
        <section className="relative min-h-[100dvh] flex items-center pt-20 pb-12 md:pb-16 overflow-clip bg-canvas">
            {/* Background Elements - Luxury Tech */}
            <div className="absolute inset-0 bg-canvas z-0" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] ambient-glow ambient-glow-teal [--glow-blur:60px] md:[--glow-blur:120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] ambient-glow ambient-glow-gold translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            {/* Intro → portfolio gallery → CTAs, stacked at every width: on desktop the
                gallery runs as a full-width horizontal row under the title. */}
            <div className="container mx-auto px-4 md:px-6 relative z-10 grid gap-y-10">

                {/* Intro */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={M3Spring.gentle}
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-canvas border border-line text-ink text-xs font-semibold uppercase tracking-wider mb-8 shadow-sm">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                        </span>
                        La Nuova Era della Ristrutturazione
                    </div>

                    {/* Headline */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-ink leading-[1.2] mb-6">
                        Realizza la <br />
                        <span className="text-accent-ink italic relative">
                            Casa dei Sogni
                            <span className="absolute -bottom-2 left-0 w-full h-1 bg-primary/30 rounded-full blur-sm"></span>
                        </span>
                        <br /> con <span className="font-trajan tracking-tight">SYD BIOEDILIZIA</span>
                    </h1>

                    <p className="text-lg md:text-xl text-ink max-w-xl leading-relaxed font-light">
                        Ristruttura il tuo appartamento in maniera tradizionale o in bioedilizia. Dall&apos;idea alla realtà in pochi click. Ottieni preventivi veloci, visualizzazioni 3D fotorealistiche e un team di esperti pronto a realizzare il tuo progetto.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, ...M3Spring.standard }}
                    className="min-w-0"
                >
                    <Portfolio initial={portfolio} />
                </motion.div>

                {/* CTAs + stats */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, ...M3Spring.gentle }}
                    // From lg the CTAs and the stats sit side by side under the gallery.
                    className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center"
                >
                    <div className="flex flex-col gap-6 mb-12 lg:mb-0">
                        {/* Primary CTA - Quote */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] bg-primary hover:bg-primary-hover text-on-primary rounded-lg shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-95 active:shadow-none"
                                onClick={() => openChat()}
                            >
                                Richiedi Preventivo Gratuito
                                <FileText className="ml-2 w-5 h-5" />
                            </Button>
                        </div>

                        {/* Secondary CTA - Rendering */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] bg-primary hover:bg-primary-hover text-on-primary rounded-lg shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-95 active:shadow-none"
                                onClick={() => openChat()}
                            >
                                Crea Rendering Gratuito
                                <Palette className="ml-2 w-5 h-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Key figures: label (dt) then value (dd) in reading order, value shown on top */}
                    <dl className="grid grid-cols-3 gap-6 border-t border-line pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
                        {[
                            { label: 'Progetti Completati', value: <StatCounter value={100} suffix="+" /> },
                            { label: 'Tempo Preventivo', value: <StatCounter value={24} suffix="h" /> },
                            { label: 'Soddisfazione Clienti', value: <StatCounter value={4.9} decimals={1} suffix="/5" /> },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex flex-col-reverse gap-1">
                                <dt className="text-sm text-ink-muted">{label}</dt>
                                <dd className="text-2xl font-bold text-ink">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </motion.div>

            </div>
        </section>
    );
}
