'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { activities, type Activity } from '@/lib/activities-data';

/** Header reveal — skipped entirely (rendered in place) under reduced motion. */
const HEADER_HIDDEN = { opacity: 0, y: 20 };
const HEADER_SHOWN = { opacity: 1, y: 0 };

/** Rendered card width: the viewport minus gutters, capped by `max-w-md` (448px) at every breakpoint. */
const CARD_IMAGE_SIZES = '(min-width: 480px) 448px, 100vw';

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
            className="pt-12 md:pt-16 pb-12 md:pb-16 relative bg-luxury-bg overflow-x-clip border-t border-luxury-gold/5"
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

                {/* Equal card heights with no measured numbers: rows alternate card /
                    connector, and every card row is 1fr — in an auto-height grid that is the
                    tallest card's content height, so all cards match the one with the most
                    text. Each <li> spans its two rows through a subgrid. */}
                <ol className="max-w-5xl mx-auto grid auto-rows-[1fr_auto]">
                    {activities.map((activity, index) => (
                        <li key={activity.id} className="row-span-2 grid grid-rows-subgrid">
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
                                        // No height here: the grid row sets it.
                                        'w-full max-w-md lg:w-[44%] [perspective:1200px]',
                                        index % 2 === 1 && '[--sd-dir:1]',
                                    )}
                                >
                                    <ActivityCard activity={activity} />
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

function ActivityCard({ activity }: { activity: Activity }) {
    const Icon = activity.icon;
    const { image } = activity;

    return (
        <article
            data-activity-card
            className={cn(
                // Height comes from the grid row (the longest text), so nothing is cut.
                // overflow-clip keeps the photo inside the rounded corners.
                'relative flex h-full w-full flex-col overflow-clip m3-shape-xl',
                // Opaque surface shared with the Services stack: at partial alpha the
                // cards would show the decoration blobs through them mid-flight. With a
                // photo it is also what shows while the image loads.
                'elevated-service-card',
            )}
        >
            {image && (
                // Decorative: the title and text already say what the photo shows.
                <Image
                    src={image}
                    alt=""
                    fill
                    placeholder="blur"
                    sizes={CARD_IMAGE_SIZES}
                    className="object-cover"
                    style={activity.focus ? { objectPosition: activity.focus } : undefined}
                />
            )}

            {/* The card is as tall as its text, so the photo sits behind the text:
                the scrim is this block's background and fills the whole card. */}
            <div
                data-activity-body
                className={cn('relative flex-1 p-5 md:p-6', image && 'activity-photo-scrim')}
            >
                <div className="flex items-center gap-4 mb-3">
                    <div
                        className={cn(
                            'w-11 h-11 shrink-0 rounded-xl flex items-center justify-center border border-luxury-gold/15 text-luxury-teal',
                            'bg-gradient-to-br from-luxury-bg/70 to-luxury-bg/40',
                        )}
                    >
                        <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>

                    <h3 className="font-serif text-xl md:text-2xl font-semibold leading-tight text-luxury-text">
                        {activity.title}
                    </h3>
                </div>

                {/* Full opacity over a photo (the scrim is sized for it); /75 is AA
                    against the plain card gradient. */}
                <p className={cn(
                    'text-base leading-relaxed font-light',
                    image ? 'text-luxury-text' : 'text-luxury-text/75',
                )}>
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
                className="h-10 md:h-14 w-px origin-top bg-gradient-to-b from-luxury-gold/70 via-luxury-gold/40 to-luxury-teal/70"
            />
            <div
                data-connector-dot
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-luxury-gold shadow-[0_0_10px_rgba(233,196,106,0.6)]"
            />
        </div>
    );
}
