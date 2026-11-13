'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, Leaf } from 'lucide-react';
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
        <section id="about" className="py-24 bg-canvas relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 ambient-glow ambient-glow-teal [--glow-alpha:5%]" />
            <div className="absolute bottom-0 left-0 w-1/3 h-1/3 ambient-glow ambient-glow-gold" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                {/* Header. h1: this is /chi-siamo's only section, and its own page
                    heading — BrandLogo (Navbar/Footer) is an image, not a heading. */}
                <div className="text-center mb-16 space-y-4">
                    <motion.h1
                        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={M3Spring.gentle}
                        className="text-3xl md:text-5xl font-serif font-bold text-ink"
                    >
                        {about.title}
                    </motion.h1>
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, scaleX: 0 }}
                        whileInView={{ opacity: 1, scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.15, ...M3Spring.standard }}
                        className="h-1 w-[100px] bg-primary mx-auto origin-center rounded-full"
                    />
                    <motion.p
                        initial={reduceMotion ? false : { opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.25 }}
                        className="text-xl md:text-2xl text-ink font-light max-w-3xl mx-auto"
                    >
                        {about.subtitle}
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

                    {/* Left Column: Main Story & Philosophy */}
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={M3Spring.gentle}
                        className="space-y-10"
                    >
                        {/* Company Intro */}
                        <div className="prose prose-lg text-ink leading-relaxed font-light">
                            <FAQAnswer blocks={about.intro} />
                        </div>

                        {/* Philosophy Box */}
                        <div className="card-powder rounded-2xl p-8 relative overflow-hidden group shadow-xs">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Leaf className="w-24 h-24 text-primary-ink" />
                            </div>
                            <h2 className="text-2xl font-serif font-bold text-ink mb-4 flex items-center gap-3">
                                <Leaf className="w-6 h-6 text-primary-ink" />
                                {about.philosophy_title}
                            </h2>
                            <div className="text-ink mb-6 font-light">
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
                                                    <Icon className="w-5 h-5 text-primary-ink mt-1 shrink-0" />
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
                        initial={reduceMotion ? false : { opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={M3Spring.gentle}
                        className="space-y-10"
                    >
                        {/* What We Do */}
                        <div>
                            <h2 className="text-2xl font-serif font-bold text-ink mb-6">
                                {about.services_title} <br />
                                <span className="text-accent-ink">{about.services_subtitle}</span>
                            </h2>
                            <div className="text-ink mb-6 font-light leading-relaxed">
                                <FAQAnswer blocks={about.services_intro} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {services.map((service) => (
                                    <div key={service.title} className="flex items-center gap-3 p-3 rounded-lg bg-primary-subtle border border-primary/10 hover:border-primary/30 transition-colors">
                                        <CheckCircle className="w-5 h-5 text-primary-ink" />
                                        <span className="text-sm text-ink font-medium">{service.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Why Choose Us */}
                        <div className="bg-surface p-8 rounded-2xl border border-line shadow-xs">
                            <h2 className="text-2xl font-serif font-bold text-ink mb-4">{about.why_title}</h2>
                            <div className="text-ink mb-6 leading-relaxed">
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
