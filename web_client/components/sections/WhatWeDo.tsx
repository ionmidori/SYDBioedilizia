'use client';

import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';
import { activities, type Activity } from '@/lib/activities-data';

gsap.registerPlugin(ScrollTrigger);

/** Extra distance past the viewport edge, so the card's shadow is off-screen too. */
const OFFSCREEN_MARGIN_PX = 48;

/** Header reveal — skipped entirely (rendered in place) under reduced motion. */
const HEADER_HIDDEN = { opacity: 0, y: 20 };
const HEADER_SHOWN = { opacity: 1, y: 0 };

export function WhatWeDo() {
    const sectionRef = useRef<HTMLElement>(null);
    const reduceMotion = useReducedMotion();

    useGSAP(
        () => {
            const mm = gsap.matchMedia();

            // Conditions object: GSAP re-runs the callback (reverting the previous
            // run) whenever either query flips, e.g. on a resize across lg.
            mm.add(
                {
                    allowMotion: '(prefers-reduced-motion: no-preference)',
                    desktop: '(min-width: 1024px)',
                },
                (context) => {
                    const { allowMotion, desktop } = context.conditions ?? {};

                    // Reduced motion: nothing is registered, so every card and
                    // connector simply renders in place at full opacity.
                    if (!allowMotion) return;

                    // The blur is repainted on every scrubbed frame on top of a
                    // three-layer shadow: fine on desktop, jank on low-end phones.
                    const blurFrom = desktop ? { filter: 'blur(6px)' } : {};
                    const blurTo = desktop ? { filter: 'blur(0px)' } : {};

                    const slots = gsap.utils.toArray<HTMLElement>('[data-activity-slot]');

                    slots.forEach((slot, index) => {
                        const card = slot.querySelector<HTMLElement>('[data-activity-card]');
                        if (!card) return;

                        // Alternating sides, matching the zig-zag layout (lg and up).
                        const fromLeft = index % 2 === 0;

                        // The transform lives on the inner card; the slot never moves, so
                        // its rect is a stable measure of how far "off-screen" is.
                        // Function values + invalidateOnRefresh recompute it on resize.
                        gsap.fromTo(
                            card,
                            {
                                x: () => {
                                    const rect = slot.getBoundingClientRect();
                                    return fromLeft
                                        ? -(rect.right + OFFSCREEN_MARGIN_PX)
                                        : window.innerWidth - rect.left + OFFSCREEN_MARGIN_PX;
                                },
                                rotateY: fromLeft ? 14 : -14,
                                opacity: 0,
                                ...blurFrom,
                            },
                            {
                                x: 0,
                                rotateY: 0,
                                opacity: 1,
                                ...blurTo,
                                ease: 'power2.out',
                                // Scrubbed, not toggled: the card's position is a function of
                                // scroll, so scrolling back up slides it out the way it came.
                                scrollTrigger: {
                                    trigger: slot,
                                    start: 'top 95%',
                                    end: 'top 55%',
                                    scrub: 0.6,
                                    invalidateOnRefresh: true,
                                },
                            },
                        );
                    });

                    gsap.utils.toArray<HTMLElement>('[data-activity-connector]').forEach((connector) => {
                        const line = connector.querySelector<HTMLElement>('[data-connector-line]');
                        const dot = connector.querySelector<HTMLElement>('[data-connector-dot]');
                        if (!line || !dot) return;

                        gsap.timeline({
                            scrollTrigger: {
                                trigger: connector,
                                start: 'top 85%',
                                end: 'bottom 60%',
                                scrub: 0.6,
                            },
                        })
                            .fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: 'none' })
                            .fromTo(dot, { scale: 0 }, { scale: 1, ease: 'back.out(3)' }, '<0.35');
                    });
                },
            );

            return () => mm.revert();
        },
        { scope: sectionRef, dependencies: [] },
    );

    return (
        // overflow-x-clip, not -hidden: the cards start fully outside the viewport,
        // and `hidden` would also turn the section into a scroll container.
        <section
            ref={sectionRef}
            id="cosa-facciamo"
            aria-labelledby="cosa-facciamo-title"
            className="pt-12 md:pt-16 pb-12 md:pb-16 relative bg-luxury-bg overflow-x-clip border-t border-luxury-gold/5"
        >
            {/* Section Background Decoration */}
            <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden="true">
                <div className="absolute top-1/4 left-0 w-80 h-80 bg-luxury-teal/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-luxury-gold/5 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-10 md:mb-14">
                    <motion.h2
                        id="cosa-facciamo-title"
                        initial={reduceMotion ? false : HEADER_HIDDEN}
                        whileInView={HEADER_SHOWN}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-serif font-bold text-luxury-text mb-4 tracking-tight"
                    >
                        Cosa <span className="text-luxury-gold italic">facciamo</span>
                    </motion.h2>
                    <motion.p
                        initial={reduceMotion ? false : HEADER_HIDDEN}
                        whileInView={HEADER_SHOWN}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-luxury-text/70 text-lg font-light"
                    >
                        Dalla singola lavorazione alla ristrutturazione integrale: squadre specializzate,
                        materiali certificati e impianti a norma, con un unico referente dal sopralluogo alla consegna.
                    </motion.p>
                </div>

                <ol className="max-w-5xl mx-auto">
                    {activities.map((activity, index) => (
                        <li key={activity.id}>
                            <div
                                className={cn(
                                    'flex justify-center',
                                    index % 2 === 0 ? 'lg:justify-start' : 'lg:justify-end',
                                )}
                            >
                                <div
                                    data-activity-slot
                                    className="w-full max-w-md lg:w-[44%] h-[212px] max-[359px]:h-[236px] md:h-[188px] [perspective:1200px]"
                                >
                                    <ActivityCard activity={activity} index={index} />
                                </div>
                            </div>

                            {index < activities.length - 1 && <Connector />}
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

function ActivityCard({ activity, index }: { activity: Activity; index: number }) {
    const Icon = activity.icon;

    return (
        <article
            data-activity-card
            className={cn(
                'relative flex h-full w-full flex-col p-5 md:p-6 m3-shape-xl',
                // Opaque surface shared with the Services stack: at partial alpha the
                // cards would show the decoration blobs through them mid-flight.
                'elevated-service-card',
            )}
        >
            {/* Decorative ordinal — the <ol> already conveys the order to assistive tech. */}
            <span
                aria-hidden="true"
                className="absolute top-4 right-5 font-serif italic text-2xl md:text-3xl text-luxury-gold/40 select-none"
            >
                {String(index + 1).padStart(2, '0')}
            </span>

            <div className="flex items-center gap-4 mb-3 pr-10">
                <div
                    className={cn(
                        'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center border border-luxury-gold/15 text-luxury-teal',
                        'bg-gradient-to-br from-luxury-bg/70 to-luxury-bg/40',
                    )}
                >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                </div>

                <h3 className="font-serif text-lg md:text-xl font-semibold leading-tight text-luxury-text">
                    {activity.title}
                </h3>
            </div>

            {/* /75 for WCAG AA against the card gradient (see ServiceCard). */}
            <p className="text-luxury-text/75 text-sm leading-relaxed font-light line-clamp-4 max-[359px]:line-clamp-5 md:line-clamp-3">
                {activity.description}
            </p>
        </article>
    );
}

/**
 * Short line centred on the screen between two cards. The vertical padding keeps
 * it clear of both cards; from lg up the zig-zag also keeps it clear horizontally.
 */
function Connector() {
    return (
        <div
            data-activity-connector
            aria-hidden="true"
            className="relative flex justify-center py-3 md:py-4"
        >
            <div
                data-connector-line
                className="h-10 md:h-14 w-px origin-top bg-gradient-to-b from-luxury-gold/70 via-luxury-gold/40 to-luxury-teal/70"
            />
            <div
                data-connector-dot
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-luxury-gold shadow-[0_0_10px_rgba(233,196,106,0.6)]"
            />
        </div>
    );
}
