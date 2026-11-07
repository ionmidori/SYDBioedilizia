'use client';

import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { activities, type Activity } from '@/lib/activities-data';

/** Header reveal — skipped entirely (rendered in place) under reduced motion. */
const HEADER_HIDDEN = { opacity: 0, y: 20 };
const HEADER_SHOWN = { opacity: 1, y: 0 };

export function WhatWeDo() {
    const reduceMotion = useReducedMotion();

    // The cards and connectors are animated by CSS scroll timelines, not here —
    // see app/scroll-animations.css. They run on the compositor thread and, under
    // reduced motion or without browser support, simply render in place.
    return (
        // overflow-x-clip, not -hidden: the cards start fully outside the viewport,
        // and `hidden` would also turn the section into a scroll container.
        <section
            id="cosa-facciamo"
            aria-labelledby="cosa-facciamo-title"
            className="pt-12 md:pt-16 pb-12 md:pb-16 relative bg-canvas overflow-x-clip border-t border-line"
        >
            {/* Section Background Decoration */}
            <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden="true">
                <div className="absolute top-1/4 left-0 w-80 h-80 ambient-glow ambient-glow-teal" />
                <div className="absolute bottom-1/4 right-0 w-80 h-80 ambient-glow ambient-glow-gold" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-10 md:mb-14">
                    <motion.h2
                        id="cosa-facciamo-title"
                        initial={reduceMotion ? false : HEADER_HIDDEN}
                        whileInView={HEADER_SHOWN}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-serif font-bold text-ink mb-4 tracking-tight"
                    >
                        Cosa <span className="text-accent-ink italic">facciamo</span>
                    </motion.h2>
                    <motion.p
                        initial={reduceMotion ? false : HEADER_HIDDEN}
                        whileInView={HEADER_SHOWN}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-ink-muted text-lg font-light"
                    >
                        Dalla singola lavorazione alla ristrutturazione integrale: squadre specializzate,
                        materiali certificati e impianti a norma, con un unico referente dal sopralluogo alla consegna.
                    </motion.p>
                </div>

                {/* Each card is as tall as its own text: no shared row height. */}
                <ol className="max-w-5xl mx-auto">
                    {activities.map((activity, index) => (
                        <li key={activity.id}>
                            <div
                                className={cn(
                                    'flex justify-center',
                                    index % 2 === 0 ? 'lg:justify-start' : 'lg:justify-end',
                                )}
                            >
                                {/* --sd-dir picks the side the card glides in from: left, right,
                                    left… at every width. Phones stack the cards in one column,
                                    but they still enter in a zig-zag; from lg they also rest on
                                    alternating sides. */}
                                <div
                                    data-activity-slot
                                    className={cn(
                                        // No height here: the card's text sets it.
                                        'w-full max-w-md lg:w-[44%] [perspective:1200px]',
                                        index % 2 === 1 && '[--sd-dir:1]',
                                    )}
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
            // Height comes from its own text, so each card fits its description.
            // `.activity-marble-card` is the stone: opaque (the cards fly over the
            // decoration glows), a marble photo under a cream veil, gold hairline
            // edge — all static, see globals.css. m3-shape-xl: the site's 24px corners.
            className="activity-marble-card m3-shape-xl relative w-full"
            // A different part of the slab per card, so no two look the same.
            style={{
                '--marble-x': `${(index * 37) % 100}%`,
                '--marble-y': index % 2 ? '80%' : '25%',
            } as CSSProperties}
        >
            <div data-activity-body className="relative p-5 md:p-6">
                <div className="flex items-center gap-3.5 mb-2.5">
                    <span className="activity-brass-tile" aria-hidden="true">
                        <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    </span>
                    <h3 className="font-serif text-xl md:text-2xl font-semibold leading-tight text-on-accent">
                        {activity.title}
                    </h3>
                </div>

                {/* /85 on the white marble: AA (≥4.5:1) even over the darkest veins, see globals.css. */}
                <p className="text-base leading-relaxed text-on-accent">
                    {activity.description}
                </p>
            </div>
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
                className="h-10 md:h-14 w-px origin-top bg-gradient-to-b from-accent/70 via-accent/40 to-primary/70"
            />
            <div
                data-connector-dot
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]"
            />
        </div>
    );
}
