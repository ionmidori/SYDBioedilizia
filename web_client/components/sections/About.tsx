'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Leaf } from 'lucide-react';
import { FAQAnswer } from '@/components/faq/FAQAnswer';
import { Button } from '@/components/ui/button';
import { openChat } from '@/lib/chat-events';
import { COMPANY_ICONS } from '@/lib/company-info/icons';
import { M3Spring } from '@/lib/m3-motion';
import type { About as AboutInfo, ServiceItem } from '@/types/company-info';

/**
 * /chi-siamo. Every text comes from the company info (`about`, `services`),
 * edited in the admin console; layout and animations are fixed here.
 */
export function About({ about, services }: { about: AboutInfo; services: ServiceItem[] }) {
    const reduceMotion = useReducedMotion();

    return (
        <section id="about" className="py-24 bg-canvas relative overflow-clip">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 ambient-glow ambient-glow-teal [--glow-alpha:5%]" />
            <div className="absolute bottom-0 left-0 w-1/3 h-1/3 ambient-glow ambient-glow-gold" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                {/* Header. h1: this is /chi-siamo's only section, and its own page
                    heading — BrandLogo (Navbar/Footer) is an image, not a heading. */}
                <div className="text-center mb-16 space-y-4">
                    <h1 className="text-3xl md:text-5xl font-serif font-bold text-ink">
                        {about.title}
                    </h1>
                    <motion.div
                        initial={reduceMotion ? false : { scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.1, ...M3Spring.standard }}
                        className="h-1 w-[100px] bg-primary mx-auto origin-center rounded-full"
                    />
                    <p className="text-xl md:text-2xl text-ink font-light max-w-3xl mx-auto">
                        {about.subtitle}
                    </p>
                    <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                        <a
                            href="#preventivo-chi-siamo"
                            className="lg:hidden inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2.5 rounded-xl border border-transparent bg-primary hover:bg-primary-hover text-on-primary text-sm font-bold shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            Vai al preventivo
                            <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </a>
                        <Link
                            href="/progetti"
                            className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2.5 rounded-xl border border-line bg-surface hover:bg-surface-muted text-ink hover:text-primary-ink text-sm font-semibold shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            Scopri i progetti realizzati
                            <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

                    {/* Left Column: Main Story & Philosophy */}
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.1 }}
                        transition={M3Spring.gentle}
                        className="space-y-10"
                    >
                        {/* Company Intro */}
                        <div className="prose prose-lg max-w-[56ch] text-ink leading-relaxed font-light">
                            <FAQAnswer blocks={about.intro} />
                        </div>

                        {/* Philosophy Box */}
                        <div className="card-powder rounded-2xl p-8 relative overflow-clip group shadow-xs">
                            <div aria-hidden="true" className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Leaf className="w-24 h-24 text-primary-ink" />
                            </div>
                            <h2 className="text-2xl font-serif font-bold text-ink mb-4 flex items-center gap-3">
                                <Leaf className="w-6 h-6 text-primary-ink shrink-0" aria-hidden="true" />
                                {about.philosophy_title}
                            </h2>
                            <div className="text-ink mb-6 font-light max-w-[56ch]">
                                <FAQAnswer blocks={about.philosophy} />
                            </div>

                            {about.excellences.length > 0 && (
                                <>
                                    <h3 className="font-serif font-bold text-primary-ink text-lg mb-4">{about.excellences_title}</h3>
                                    <ul className="space-y-3">
                                        {about.excellences.map((excellence) => {
                                            const Icon = COMPANY_ICONS[excellence.icon];
                                            return (
                                                <li key={excellence.title} className="flex items-start gap-3">
                                                    <Icon className="w-5 h-5 text-primary-ink mt-1 shrink-0" aria-hidden="true" />
                                                    <span className="text-sm text-ink">
                                                        <strong>{excellence.title}:</strong> {excellence.text}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                    </motion.div>

                    {/* Right Column: Services & CTA */}
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.1 }}
                        transition={M3Spring.gentle}
                        className="space-y-10"
                    >
                        {/* What We Do */}
                        <div>
                            <h2 className="text-2xl font-serif font-bold text-ink mb-6">
                                {about.services_title} <br />
                                <span className="text-accent-ink">{about.services_subtitle}</span>
                            </h2>
                            <div className="text-ink mb-6 font-light leading-relaxed max-w-[56ch]">
                                <FAQAnswer blocks={about.services_intro} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {services.map((service) => (
                                    <div key={service.title} className="flex items-center gap-3 p-3 rounded-lg bg-primary-subtle border border-primary/10 hover:border-primary/30 transition-colors">
                                        <CheckCircle className="w-5 h-5 text-primary-ink shrink-0" aria-hidden="true" />
                                        <span className="text-sm text-ink font-medium">{service.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Why Choose Us */}
                        <div id="preventivo-chi-siamo" className="bg-surface p-8 rounded-2xl border border-line shadow-xs scroll-mt-24">
                            <h2 className="text-2xl font-serif font-bold text-ink mb-4">{about.why_title}</h2>
                            <div className="text-ink mb-6 leading-relaxed max-w-[56ch]">
                                <FAQAnswer blocks={about.why_choose} />
                            </div>
                            {/* The quote comes first: the site visit is asked for after receiving it
                                (the note under the button says so). */}
                            <Button
                                className="w-full bg-primary hover:bg-primary-hover text-on-primary font-bold py-6 text-lg shadow-lg"
                                onClick={() => openChat()}
                            >
                                {about.cta_label}
                            </Button>
                            {about.cta_note && (
                                <p className="mt-4 text-sm text-ink-muted text-center">{about.cta_note}</p>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
