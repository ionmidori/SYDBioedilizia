'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, ImageOff } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { SnapRail } from '@/components/ui/snap-rail';
import { cn } from '@/lib/utils';
import { M3Duration, M3EasingFM } from '@/lib/m3-motion';
import { triggerHaptic } from '@/lib/haptics';
import {
    ALL_CATEGORIES,
    PORTFOLIO_RAIL_LIMIT,
    defaultProjects,
    deriveCategories,
    fetchPortfolio,
    filterByCategory,
    type PortfolioItem,
} from '@/lib/portfolio';

export function Portfolio() {
    const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
    const [hoveredProject, setHoveredProject] = useState<string | null>(null);
    const [projects, setProjects] = useState<PortfolioItem[]>(defaultProjects);
    const [activeRailIndex, setActiveRailIndex] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Load from backend API (3-Tier: no direct Firestore)
    useEffect(() => {
        fetchPortfolio().then(setProjects);
    }, []);

    const categories = deriveCategories(projects);
    const filteredProjects = filterByCategory(projects, activeCategory);
    const railProjects = filteredProjects.slice(0, PORTFOLIO_RAIL_LIMIT);
    // Clamped: a category change can leave the index pointing past the shorter list
    // for the render that happens before the rail remounts.
    const activeProject = railProjects[Math.min(activeRailIndex, railProjects.length - 1)];

    // Swiping to another card collapses whatever was open — no effect needed,
    // the rail tells us when the active card changes.
    const handleActiveChange = (index: number) => {
        setActiveRailIndex(index);
        setExpandedId(null);
    };

    return (
        <section id="portfolio" className="py-24 bg-luxury-bg relative overflow-hidden border-t border-luxury-gold/5">
            <div className="container mx-auto px-4 md:px-6 relative z-10">

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 md:mb-12 gap-6 md:gap-8">
                    <div>
                        <h2 className="text-3xl md:text-5xl font-serif font-bold text-luxury-text mb-4">
                            I Nostri <span className="text-luxury-gold italic">Capolavori</span>
                        </h2>
                        <p className="text-luxury-text/70 max-w-lg text-lg font-light">
                            Esplora una selezione delle nostre migliori ristrutturazioni. Ogni progetto è unico, proprio come chi lo abita.
                        </p>
                    </div>

                    <div
                        className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap"
                        role="group"
                        aria-label="Filtra per categoria"
                    >
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                aria-pressed={activeCategory === cat}
                                className={cn(
                                    "shrink-0 px-4 min-h-[44px] rounded-full text-sm font-medium transition-all duration-300 border",
                                    activeCategory === cat
                                        ? "bg-luxury-gold text-luxury-bg border-luxury-gold"
                                        : "bg-transparent text-luxury-text/60 border-luxury-gold/20 hover:border-luxury-gold/50 hover:text-luxury-text"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Mobile: horizontal snap rail with a sticky title reveal ── */}
                <div className="md:hidden">
                    {railProjects.length === 0 ? (
                        <EmptyState category={activeCategory} onReset={() => setActiveCategory(ALL_CATEGORIES)} />
                    ) : (
                        <>
                            {/* Screen-reader-only progress announcement — the visible sticky
                                title below is aria-hidden, so this is the only spoken signal
                                that the swipe moved to a different card. */}
                            <p className="sr-only" aria-live="polite">
                                Progetto {activeRailIndex + 1} di {railProjects.length}: {activeProject?.title}
                            </p>

                            {/* Decorative: each card carries its own accessible name. */}
                            <div className="mb-5 h-[4.5rem] overflow-hidden" aria-hidden="true">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    <motion.div
                                        key={activeProject?.id ?? 'none'}
                                        initial={{ y: '100%', opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: '-100%', opacity: 0 }}
                                        transition={{ duration: M3Duration.medium1, ease: M3EasingFM.standard }}
                                    >
                                        <h3 className="text-2xl font-serif font-bold text-luxury-text truncate">
                                            {activeProject?.title}
                                        </h3>
                                        <p className="text-sm text-luxury-gold/80 font-light truncate">
                                            {activeProject?.location}
                                        </p>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            <SnapRail
                                // Remounting on category change resets both the scroll
                                // position and the active index to the new first card.
                                key={activeCategory}
                                ariaLabel="Progetti in evidenza"
                                itemWidth="85vw"
                                align="center"
                                showDots
                                autoPlay
                                onActiveChange={handleActiveChange}
                                className="-mx-4 px-4"
                            >
                                {railProjects.map((project, index) => (
                                    <MobileProjectCard
                                        key={project.id}
                                        project={project}
                                        isActive={index === activeRailIndex}
                                        isExpanded={expandedId === project.id}
                                        onToggle={() =>
                                            setExpandedId((prev) =>
                                                prev === project.id ? null : project.id,
                                            )
                                        }
                                    />
                                ))}
                            </SnapRail>
                        </>
                    )}
                </div>

                {/* ── Desktop: unchanged grid ── */}
                <motion.div
                    layout
                    className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8"
                >
                    <AnimatePresence>
                        {filteredProjects.map((project, idx) => (
                            <motion.div
                                layout
                                key={project.id}
                                initial={{ opacity: 0, y: 40 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.5, delay: idx * 0.1, ease: 'easeOut' }}
                                viewport={{ once: true, margin: "-30% 0px -30% 0px" }}
                                className={cn(
                                    "group relative aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer bg-slate-950 border border-luxury-gold/10 hover:border-luxury-gold/50 transition-colors",
                                    hoveredProject === project.id && "border-luxury-gold/50"
                                )}
                                onMouseEnter={() => setHoveredProject(project.id)}
                                onMouseLeave={() => setHoveredProject(null)}
                            >
                                <ProjectImage
                                    project={project}
                                    sizes="(max-width: 1200px) 50vw, 33vw"
                                    className={cn(
                                        "object-cover transition-transform duration-700 group-hover:scale-110",
                                        hoveredProject === project.id && "scale-110"
                                    )}
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-luxury-bg via-luxury-bg/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

                                <div className="absolute inset-0 p-6 flex flex-col justify-end translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                    <div className="relative z-20">
                                        <p className="text-white text-sm font-medium mb-2 -translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 delay-75">
                                            {project.category}
                                        </p>

                                        <h3 className="text-2xl font-bold text-luxury-text mb-2">{project.title}</h3>

                                        {/* grid-rows trick: animates height without touching layout-triggering properties */}
                                        <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-300 delay-100">
                                            <div className="overflow-hidden">
                                                <p className="text-luxury-text/80 text-sm mb-4 font-light">
                                                    {project.description}
                                                </p>
                                                <ProjectStats stats={project.stats} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-200">
                                    <div className="w-10 h-10 rounded-full bg-luxury-teal/20 backdrop-blur-md flex items-center justify-center border border-luxury-teal/50 text-luxury-text hover:bg-luxury-teal hover:text-white transition-colors">
                                        <ArrowUpRight className="w-5 h-5" />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>

                {filteredProjects.length === 0 && (
                    <div className="hidden md:block">
                        <EmptyState category={activeCategory} onReset={() => setActiveCategory(ALL_CATEGORIES)} />
                    </div>
                )}

                <div className="mt-12 md:mt-16 text-center">
                    <Button
                        asChild
                        size="lg"
                        className="px-10 h-14 text-base bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-lg shadow-lg shadow-luxury-teal/20 transition-all hover:scale-[1.02]"
                    >
                        <Link href="/progetti">Visualizza tutti i progetti</Link>
                    </Button>
                </div>

            </div>
        </section>
    );
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function MobileProjectCard({
    project,
    isActive,
    isExpanded,
    onToggle,
}: {
    project: PortfolioItem;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const handleToggle = () => {
        triggerHaptic();
        onToggle();
    };

    return (
        <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            className={cn(
                "relative block w-full aspect-[3/4] rounded-2xl overflow-hidden text-left bg-slate-950 border transition-colors duration-300 cinematic-focus",
                isActive ? "border-luxury-gold/50" : "border-luxury-gold/10"
            )}
        >
            <ProjectImage
                project={project}
                sizes="85vw"
                className={cn(
                    "object-cover transition-transform duration-700",
                    isActive ? "scale-105" : "scale-100"
                )}
            />

            {/* Scrim confined to the lower third, where the hint and stats sit.
                Renovation shots are often near-white there, so it needs to carry text —
                but it's kept translucent (not fully opaque) and clears early so the
                photo itself, which is the actual product, stays as visible as possible. */}
            <div className="absolute inset-0 bg-gradient-to-t from-luxury-bg/75 from-25% to-transparent to-55%" />

            {/* Positioned absolutely, not inside the bottom-anchored column below: it
                used to sit at the top of that flex-col and get pushed off the card's
                top edge (past the button's overflow-hidden) whenever the description
                expanded and grew the column upward. */}
            <span className="absolute top-4 left-4 z-10 inline-flex px-3 py-1 rounded-full text-xs font-medium bg-luxury-bg/70 backdrop-blur-sm border border-luxury-gold/20 text-luxury-gold">
                {project.category}
            </span>

            <div className="absolute inset-0 p-5 flex flex-col justify-end">
                {/* The reveal follows the user's swipe, not the page scroll.
                    text-shadow (inherited by every descendant) is what keeps the stats
                    line legible on a near-white shot now that the scrim above is lighter:
                    the fix for low contrast is a shadow under the text, not a darker
                    scrim — that would defeat the point of lightening it. */}
                <motion.div
                    animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 12 }}
                    transition={{ duration: M3Duration.medium1, ease: M3EasingFM.standard }}
                    className="[text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_2px_10px_rgba(0,0,0,0.6)]"
                >
                    {/* grid-rows 0fr→1fr animates height without touching layout-triggering
                        properties — the CLS-safe replacement for animating max-height.
                        line-clamp bounds how tall the expanded row can grow: without it,
                        a long real-world description (longer than the placeholder copy)
                        could still push past the card's top edge the same way the chip
                        used to. */}
                    <div
                        className={cn(
                            "grid transition-[grid-template-rows] duration-300",
                            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        )}
                    >
                        <div className="overflow-hidden">
                            <p className="text-luxury-text/85 text-sm font-light pb-3 line-clamp-6">
                                {project.description}
                            </p>
                        </div>
                    </div>

                    <span className="block text-xs text-luxury-gold/70 font-medium pb-3">
                        {isExpanded ? 'Tocca per ridurre' : 'Tocca per leggere'}
                    </span>

                    <ProjectStats stats={project.stats} />
                </motion.div>
            </div>

            <span className="sr-only">
                {project.title}, {project.location}. Tocca per {isExpanded ? 'ridurre' : 'leggere'} la descrizione completa.
            </span>
        </button>
    );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function ProjectImage({
    project,
    sizes,
    className,
}: {
    project: PortfolioItem;
    sizes: string;
    className?: string;
}) {
    if (!project.image) {
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-luxury-bg/80">
                <ImageOff className="w-8 h-8 text-luxury-text/20" aria-hidden="true" />
            </div>
        );
    }

    return (
        <Image
            src={project.image}
            alt={project.title}
            fill
            sizes={sizes}
            className={className}
        />
    );
}

function ProjectStats({ stats }: { stats: PortfolioItem['stats'] }) {
    return (
        <div className="flex gap-4 border-t border-luxury-text/10 pt-3">
            {([
                ['Area', stats.area],
                ['Tempo', stats.duration],
                ['Budget', stats.budget],
            ] as const).map(([label, value]) => (
                <div key={label}>
                    <p className="text-[10px] text-luxury-gold/80 uppercase tracking-wider">{label}</p>
                    <p className="text-xs text-luxury-text font-medium">{value || '—'}</p>
                </div>
            ))}
        </div>
    );
}

function EmptyState({ category, onReset }: { category: string; onReset: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-luxury-text/10 bg-luxury-bg/20 py-12 px-6 text-center">
            <p className="text-luxury-text/60 text-sm mb-4">
                Nessun progetto nella categoria &laquo;{category}&raquo;.
            </p>
            <button
                onClick={onReset}
                className="min-h-[44px] px-5 rounded-full bg-luxury-gold text-luxury-bg text-sm font-bold transition-colors hover:bg-luxury-gold/90"
            >
                Mostra tutti
            </button>
        </div>
    );
}
