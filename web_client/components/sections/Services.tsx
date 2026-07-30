'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
    Wand2,
    LayoutDashboard,
    HardHat,
    type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { triggerHaptic } from '@/lib/haptics';
import { M3Transition } from '@/lib/m3-motion';
import { useStaggerReveal } from '@/hooks/use-scroll-animation';

interface Service {
    icon: LucideIcon;
    title: string;
    description: string;
    iconColor: string;
}

const services: Service[] = [
    {
        icon: LayoutDashboard,
        title: 'Area personale',
        description: 'Controlla ogni aspetto del cantiere dalla tua area personale: avanzamento lavori, documenti, fatture e comunicazioni con il team.',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: Wand2,
        title: 'Design AI e Preventivi Veloci',
        description: 'Genera centinaia di varianti di design per la tua casa in pochi secondi e ottieni subito una stima dettagliata dei costi, revisionata dal nostro team tecnico in tempi record.',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: HardHat,
        title: 'Direzione Lavori e Consegna',
        description: 'I nostri architetti partner seguono il cantiere passo dopo passo e gestiamo tutto noi, dalla burocrazia alle pulizie finali: ti consegniamo una casa pronta da vivere.',
        iconColor: 'text-luxury-teal'
    }
];

/** Vertical offset added per card so the stack shows the edge of the ones below. */
const STACK_STEP_PX = 16;
/** Where the first card comes to rest, clearing the fixed navbar. */
const STACK_TOP_PX = 88;
/** Height of the card itself — the content box, not the slot. */
const STACK_SLOT_PX = 260;
/**
 * Breathing room between stacked card edges, added as the slot's bottom padding.
 *
 * The card's own height must never shrink to make room for this — that clips the
 * last line of every description under the next card, permanently. So the slot
 * grows instead: `height: STACK_SLOT_PX + STACK_GAP_PX`, `paddingBottom:
 * STACK_GAP_PX`, `boxSizing: border-box`. The content box the card actually fills
 * is still exactly STACK_SLOT_PX — `ServiceCard`'s `h-full` resolves the same as
 * before — while the gap opens up as dead space below it.
 */
const STACK_GAP_PX = 14;

export function Services() {
    const { user } = useAuth();
    const router = useRouter();
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [hoveredService, setHoveredService] = useState<number | null>(null);
    const stackRef = useRef<HTMLDivElement>(null);

    // Desktop-only stagger reveal — the mobile stack drives its own motion.
    const gridRef = useStaggerReveal<HTMLDivElement>(
        '[role="article"]',
        { y: 30, stagger: 0.15, start: 'top 80%' }
    );

    // ── Mobile "stratigrafia": covered cards recede as the next one slides over ──
    useGSAP(
        () => {
            const mm = gsap.matchMedia();

            // Scoped to mobile and to users who have not asked for reduced motion;
            // the sticky stacking itself is pure CSS and survives both.
            mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', () => {
                const slots = gsap.utils.toArray<HTMLElement>('[data-stack-slot]');

                slots.forEach((slot, index) => {
                    // The last card is never covered, so it never recedes.
                    if (index === slots.length - 1) return;

                    const card = slot.querySelector<HTMLElement>('[data-stack-card]');
                    if (!card) return;

                    // Transform lives on the inner card, never on the sticky slot:
                    // a transform on the sticky element's ancestor would break stickiness.
                    // fromTo with an explicit starting filter: interpolating from
                    // `none` gives GSAP no function list to match against and the
                    // card lands almost black instead of gently dimmed.
                    //
                    // No opacity either — fading a covered card would let the cards
                    // beneath it show through, which is exactly what the opaque
                    // surface is there to prevent.
                    gsap.fromTo(
                        card,
                        { scale: 1, filter: 'saturate(1) brightness(1)' },
                        {
                            scale: 0.96,
                            filter: 'saturate(0.8) brightness(0.88)',
                            ease: 'none',
                            scrollTrigger: {
                                trigger: slot,
                                start: `top top+=${STACK_TOP_PX}`,
                                end: `bottom top+=${STACK_TOP_PX}`,
                                scrub: true,
                            },
                        },
                    );
                });
            });

            return () => mm.revert();
        },
        { scope: stackRef, dependencies: [] },
    );

    const handleCardClick = (serviceTitle: string) => {
        triggerHaptic();

        if (serviceTitle === 'Area personale') {
            if (user && !user.isAnonymous) {
                router.push('/dashboard');
            } else {
                setAuthDialogOpen(true);
            }
        } else {
            // Tutte le altre schede attivano l'IA
            const event = new CustomEvent('OPEN_CHAT');
            window.dispatchEvent(event);
        }
    };

    return (
        // overflow-clip rather than -hidden: `hidden` would make this section a
        // scroll container and silently kill the sticky stack below.
        // Bottom trimmed (paired with Portfolio's trimmed top) so "I Nostri Capolavori"
        // follows on from the last service card instead of a full section gap away.
        <section id="services" className="pt-20 pb-8 md:pb-10 relative bg-luxury-bg overflow-clip">
            {/* Section Background Decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl opacity-30 pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 bg-luxury-teal/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-luxury-gold/5 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                {/* Header */}
                <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-luxury-text mb-4 tracking-tight"
                    >
                        Tecnologia al servizio del <span className="text-luxury-gold italic">Design</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-luxury-text/70 text-lg md:text-xl font-light"
                    >
                        Abbiamo reingegnerizzato il processo di ristrutturazione per renderlo semplice, trasparente e sorprendentemente veloce.
                    </motion.p>
                </div>

                {/* ── Mobile: sticky stack ── */}
                <div ref={stackRef} className="md:hidden relative">
                    {services.map((service, index) => (
                        <div
                            key={service.title}
                            data-stack-slot
                            className="sticky box-border"
                            style={{
                                height: `${STACK_SLOT_PX + STACK_GAP_PX}px`,
                                paddingBottom: `${STACK_GAP_PX}px`,
                                top: `${STACK_TOP_PX + index * STACK_STEP_PX}px`,
                            }}
                        >
                            <ServiceCard
                                service={service}
                                onClick={() => handleCardClick(service.title)}
                                stacked
                            />
                        </div>
                    ))}
                </div>

                {/* ── Desktop: unchanged grid ── */}
                <motion.div
                    ref={gridRef}
                    // 3 columns for 3 cards: md:grid-cols-2 would leave an orphan
                    // second row with a single card in it.
                    className="hidden md:grid md:grid-cols-3 gap-6"
                >
                    {services.map((service, index) => (
                        <motion.div
                            key={service.title}
                            role="article"
                            whileHover={{ y: -4, transition: M3Transition.containerTransform }}
                            whileTap={{ scale: 0.98, transition: M3Transition.buttonPress }}
                            onClick={() => handleCardClick(service.title)}
                            onMouseEnter={() => setHoveredService(index)}
                            onMouseLeave={() => setHoveredService(null)}
                            className={cn(
                                "group relative p-6 md:p-8 m3-shape-xl touch-pan-y cinematic-focus cursor-pointer transition-all duration-500",
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
                            <div className="flex items-center gap-4 mb-4">
                                <div className={cn(
                                    "w-12 h-12 lg:w-14 lg:h-14 shrink-0 rounded-xl flex items-center justify-center border border-luxury-gold/10 transition-transform duration-500",
                                    "bg-[radial-gradient(circle_at_30%_20%,rgba(233,196,106,0.14),rgba(38,70,83,0.55)_70%)]",
                                    service.iconColor,
                                    hoveredService === index && "scale-110 shadow-premium"
                                )}>
                                    <service.icon className="w-6 h-6 lg:w-7 lg:h-7" />
                                </div>

                                <h3 className={cn(
                                    "font-serif text-lg lg:text-2xl font-semibold text-luxury-text transition-colors duration-300",
                                    hoveredService === index && "text-luxury-gold"
                                )}>
                                    {service.title}
                                </h3>
                            </div>

                            {/* /70 rather than /60: at font-light 14–16px over the glass
                                backdrop, /60 measures 3.8:1 — short of WCAG AA. */}
                            <p className="text-luxury-text/70 text-sm md:text-base leading-relaxed font-light">
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
    stacked = false,
}: {
    service: Service;
    onClick: () => void;
    stacked?: boolean;
}) {
    return (
        <button
            type="button"
            data-stack-card={stacked ? '' : undefined}
            onClick={onClick}
            className={cn(
                'group relative flex h-full w-full flex-col justify-center p-6 text-left m3-shape-xl cinematic-focus',
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
            <div className="flex items-center gap-4 mb-4">
                <div className={cn(
                    'w-12 h-12 shrink-0 rounded-xl flex items-center justify-center border border-luxury-gold/15',
                    // Alpha is safe here: the chip sits inside an already-opaque
                    // card, so it only blends with its own parent, not the stack.
                    'bg-gradient-to-br from-luxury-bg/70 to-luxury-bg/40',
                    service.iconColor,
                )}>
                    <service.icon className="w-6 h-6" />
                </div>

                <h3 className="font-serif text-lg font-semibold text-luxury-text">
                    {service.title}
                </h3>
            </div>

            {/* /75 rather than /70: /70 measures 4.47:1 against the card
                gradient, just short of WCAG AA for this text size. */}
            <p className="text-luxury-text/75 text-sm leading-relaxed font-light">
                {service.description}
            </p>
        </button>
    );
}
