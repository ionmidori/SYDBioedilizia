'use client';

import { Fragment, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { triggerHaptic } from '@/lib/haptics';
import { M3Transition, createStaggerVariants } from '@/lib/m3-motion';
import { services, type Service, type ServiceAction } from '@/lib/services-data';
import { openChat } from '@/lib/chat-events';

/** Vertical offset added per card so the stack shows the edge of the ones below. */
const STACK_STEP_PX = 16;
/** Where the first card comes to rest, clearing the fixed navbar. */
const STACK_TOP_PX = 88;
/** Breathing room between stacked card edges, added as the slot's bottom padding. */
const STACK_GAP_PX = 14;

/** Header reveal — skipped entirely (rendered in place) under reduced motion. */
const HEADER_HIDDEN = { opacity: 0, y: 20 };
const HEADER_SHOWN = { opacity: 1, y: 0 };

/** Desktop grid: the cards rise in one after another the first time it is seen. */
const GRID_REVEAL = createStaggerVariants({ y: 30 }, 0.15);

/**
 * Timeline name shared by a covered card and the marker that drives it — see
 * `[data-stack-marker]` in app/scroll-animations.css.
 */
const stackTimeline = (index: number) => `--stack-${index}`;

export function Services() {
    const { user } = useAuth();
    const router = useRouter();
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [hoveredService, setHoveredService] = useState<number | null>(null);
    const reduceMotion = useReducedMotion();

    // The mobile "stratigrafia" (covered cards recede as the next one slides over)
    // is a CSS scroll timeline — see app/scroll-animations.css — so it runs on the
    // compositor. The sticky stacking itself is plain CSS and survives both
    // reduced motion and browsers without scroll timelines.

    const handleCardClick = (action: ServiceAction) => {
        triggerHaptic();

        switch (action) {
            case 'dashboard':
                if (user && !user.isAnonymous) {
                    router.push('/dashboard');
                } else {
                    setAuthDialogOpen(true);
                }
                break;
            case 'chat':
                openChat();
                break;
        }
    };

    return (
        // overflow-clip rather than -hidden: `hidden` would make this section a
        // scroll container and silently kill the sticky stack below.
        // Bottom trimmed (paired with WhatWeDo's trimmed top) so "Cosa facciamo"
        // follows on from the last service card instead of a full section gap away.
        <section id="services" className="pt-20 pb-8 md:pb-10 relative bg-luxury-bg overflow-clip">
            {/* Section Background Decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl opacity-30 pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 ambient-glow ambient-glow-teal" />
                <div className="absolute bottom-0 left-0 w-96 h-96 ambient-glow ambient-glow-gold" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                {/* Header */}
                <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
                    <motion.h2
                        initial={reduceMotion ? false : HEADER_HIDDEN}
                        whileInView={HEADER_SHOWN}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-luxury-text mb-4 tracking-tight"
                    >
                        Tecnologia al servizio del <span className="text-luxury-gold italic">Design</span>
                    </motion.h2>
                    <motion.p
                        initial={reduceMotion ? false : HEADER_HIDDEN}
                        whileInView={HEADER_SHOWN}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-luxury-text/70 text-lg md:text-xl font-light"
                    >
                        Abbiamo reingegnerizzato il processo di ristrutturazione per renderlo semplice, trasparente e sorprendentemente veloce.
                    </motion.p>
                </div>

                {/* ── Mobile: sticky stack ── */}
                <div
                    // One grid row per card, every row 1fr: in an auto-height grid that
                    // is the tallest card's content, so all cards match the longest text
                    // at any width, font size or zoom — no hand-measured height. They
                    // must match: a shorter card would show the text of the one it covers.
                    // max-w-md: the same 448px cap as the "Cosa facciamo" cards.
                    className="md:hidden relative mx-auto grid w-full max-w-md grid-cols-1 auto-rows-[1fr]"
                    // timelineScope exposes each marker's timeline to its card, which is
                    // a sibling of the marker's, not a descendant. --stack-top feeds the
                    // same timeline in app/scroll-animations.css, so layout and
                    // animation cannot drift apart.
                    style={{
                        timelineScope: services.slice(0, -1).map((_, i) => stackTimeline(i)).join(', '),
                        '--stack-top': `${STACK_TOP_PX}px`,
                    } as CSSProperties}
                >
                    {services.map((service, index) => {
                        // The last card is never covered, so it never recedes.
                        const covered = index < services.length - 1;
                        return (
                            <Fragment key={service.id}>
                                <div
                                    data-stack-slot
                                    className="sticky box-border"
                                    style={{
                                        // Explicit cell: the marker below shares it.
                                        gridRow: index + 1,
                                        gridColumn: 1,
                                        // Gap below the card without shrinking it: the row
                                        // grows instead, so no description is ever clipped.
                                        paddingBottom: `${STACK_GAP_PX}px`,
                                        top: `${STACK_TOP_PX + index * STACK_STEP_PX}px`,
                                    }}
                                >
                                    {/* The recede runs on this wrapper, never on the sticky
                                        slot (a transform there would break stickiness) and never
                                        on the button, whose own `scale` is its press feedback. */}
                                    <div
                                        data-stack-card={covered ? '' : undefined}
                                        className="relative h-full"
                                        style={covered ? ({ animationTimeline: stackTimeline(index) } as CSSProperties) : undefined}
                                    >
                                        <ServiceCard
                                            service={service}
                                            onClick={() => handleCardClick(service.action)}
                                        />
                                        {covered && (
                                            // Dims the covered card: an opacity change
                                            // instead of a per-frame filter repaint.
                                            <span
                                                data-stack-shade
                                                aria-hidden="true"
                                                className="pointer-events-none absolute inset-0 m3-shape-xl bg-black opacity-0"
                                                style={{ animationTimeline: stackTimeline(index) } as CSSProperties}
                                            />
                                        )}
                                    </div>
                                </div>
                                {/* Fills this slot's grid cell but is not sticky: it stays
                                    where the slot sits in normal flow and keeps scrolling
                                    while the slot is stuck, so its view timeline measures
                                    the real row height. Empty and click-through. */}
                                {covered && (
                                    <div
                                        data-stack-marker
                                        aria-hidden="true"
                                        className="pointer-events-none"
                                        style={{
                                            gridRow: index + 1,
                                            gridColumn: 1,
                                            viewTimelineName: stackTimeline(index),
                                        } as CSSProperties}
                                    />
                                )}
                            </Fragment>
                        );
                    })}
                </div>

                {/* ── Desktop: unchanged grid ── */}
                <motion.div
                    variants={GRID_REVEAL.container}
                    initial={reduceMotion ? false : 'hidden'}
                    whileInView="visible"
                    viewport={{ once: true, margin: '0px 0px -20% 0px' }}
                    // 3 columns for 3 cards: md:grid-cols-2 would leave an orphan
                    // second row with a single card in it.
                    className="hidden md:grid md:grid-cols-3 gap-6"
                >
                    {services.map((service, index) => (
                        <motion.div
                            key={service.id}
                            role="article"
                            variants={GRID_REVEAL.item}
                            whileHover={{ y: -4, transition: M3Transition.containerTransform }}
                            whileTap={{ scale: 0.98, transition: M3Transition.buttonPress }}
                            onClick={() => handleCardClick(service.action)}
                            onMouseEnter={() => setHoveredService(index)}
                            onMouseLeave={() => setHoveredService(null)}
                            className={cn(
                                "group relative p-6 m3-shape-xl touch-pan-y cinematic-focus cursor-pointer transition-shadow duration-500",
                                // Gold gradient border and specular highlight ride on the
                                // class's own pseudo-elements, so no Tailwind `border` here.
                                "glass-services-card",
                                hoveredService === index
                                    ? "shadow-elevation-high shadow-luxury-teal/20"
                                    : "shadow-elevation-low"
                            )}
                        >
                            {/* Icon and title share a row. The icon keeps shrink-0 so a
                                two-line title cannot squeeze it, and its hover scale is a
                                transform — it never nudges the title beside it. */}
                            <div className="flex items-center gap-3.5 mb-2.5">
                                <div className={cn(
                                    "w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center border border-luxury-gold/10 transition-transform duration-500",
                                    "bg-[radial-gradient(circle_at_30%_20%,rgba(233,196,106,0.14),rgba(38,70,83,0.55)_70%)] text-luxury-teal",
                                    hoveredService === index && "scale-110 shadow-premium"
                                )}>
                                    <service.icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
                                </div>

                                <h3 className={cn(
                                    "font-serif text-xl md:text-2xl font-semibold leading-tight text-luxury-text transition-colors duration-300",
                                    hoveredService === index && "text-luxury-gold"
                                )}>
                                    {service.title}
                                </h3>
                            </div>

                            {/* /70 rather than /60: at font-light 14–16px over the glass
                                backdrop, /60 measures 3.8:1 — short of WCAG AA. */}
                            <p className="text-luxury-text/70 text-base leading-relaxed font-light">
                                {service.description}
                            </p>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
        </section>
    );
}

function ServiceCard({
    service,
    onClick,
}: {
    service: Service;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group relative flex h-full w-full flex-col justify-center p-5 text-left m3-shape-xl cinematic-focus',
                // Fully opaque, not `surface-container-high` (85% alpha) and not
                // glassmorphism: at anything below 100% the text of three stacked
                // cards shows through at once. `.elevated-service-card` keeps that
                // rule (alpha-free gradient stops, a hair lighter than the #264653
                // page background) and layers shadows for the elevated look.
                'elevated-service-card',
                'transition-transform duration-200 active:scale-[0.98]',
            )}
        >
            {/* Icon and title on one row — shrink-0 keeps the icon square when a long
                title wraps to a second line. */}
            <div className="flex items-center gap-3.5 mb-2.5">
                <div className={cn(
                    'w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center border border-luxury-gold/15',
                    // Alpha is safe here: the chip sits inside an already-opaque
                    // card, so it only blends with its own parent, not the stack.
                    'bg-gradient-to-br from-luxury-bg/70 to-luxury-bg/40 text-luxury-teal',
                )}>
                    <service.icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </div>

                <h3 className="font-serif text-xl font-semibold leading-tight text-luxury-text">
                    {service.title}
                </h3>
            </div>

            {/* /75 rather than /70: /70 measures 4.47:1 against the card
                gradient, just short of WCAG AA. Same 16px as the "Cosa facciamo"
                cards, as are the title, icon and padding. */}
            <p className="text-luxury-text/75 text-base leading-relaxed font-light">
                {service.description}
            </p>
        </button>
    );
}
