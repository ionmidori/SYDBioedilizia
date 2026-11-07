'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SnapRail } from '@/components/ui/snap-rail';
import { DesktopProjectCard } from '@/components/portfolio/DesktopProjectCard';
import { MobileProjectCard } from '@/components/portfolio/MobileProjectCard';
import { RowArrow } from '@/components/portfolio/RowArrow';
import { cn } from '@/lib/utils';
import { M3Duration, M3EasingFM } from '@/lib/m3-motion';
import { prefersReducedMotion } from '@/lib/reduced-motion';
import { PORTFOLIO_RAIL_LIMIT, cardSubtitle, withExamples, type PortfolioItem } from '@/lib/portfolio';
import { usePortfolioProjects } from '@/lib/portfolio/use-portfolio-projects';

export function Portfolio({
    className,
    initial,
}: {
    className?: string;
    /** Server-rendered real projects (`getPortfolio()`); without them the gallery fetches on mount. */
    initial?: PortfolioItem[];
}) {
    // Real projects first, then labelled examples up to PORTFOLIO_MIN_CARDS.
    // Memoised: the rail autoplays, so this component re-renders every few seconds.
    const realProjects = usePortfolioProjects(initial);
    const projects = useMemo(() => withExamples(realProjects), [realProjects]);
    const [activeRailIndex, setActiveRailIndex] = useState(0);
    // Descriptions are visible by default; this tracks which one (if any) the user has
    // chosen to hide. null means "none hidden" — i.e. everything showing.
    const [hiddenId, setHiddenId] = useState<string | null>(null);


    // No category filters here — they live on the archive page (`/progetti`), which
    // the CTA below links to. Never empty while examples are on (PORTFOLIO_MIN_CARDS).
    const railProjects = projects.slice(0, PORTFOLIO_RAIL_LIMIT);
    // Clamped: the list can shrink when the backend response replaces the first render.
    const activeProject = railProjects[Math.min(activeRailIndex, railProjects.length - 1)];

    // ── Desktop row (lg+): horizontal scroll driven by the arrow buttons ──
    const rowRef = useRef<HTMLDivElement>(null);
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);

    const updateRowEdges = useCallback(() => {
        const row = rowRef.current;
        if (!row) return;
        // 1px tolerance: fractional card widths leave scrollLeft a hair short of the end.
        setCanScrollPrev(row.scrollLeft > 1);
        setCanScrollNext(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    }, []);

    useEffect(() => {
        updateRowEdges();
        window.addEventListener('resize', updateRowEdges);
        return () => window.removeEventListener('resize', updateRowEdges);
    }, [updateRowEdges, projects.length]);

    // One "page" of cards per click; snap-start then lands on a card edge.
    const scrollRow = (direction: 1 | -1) => {
        const row = rowRef.current;
        if (!row) return;
        row.scrollBy({
            left: direction * row.clientWidth,
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
    };

    // Swiping to another card resets to the default (description visible) — no effect
    // needed, the rail tells us when the active card changes.
    const handleActiveChange = (index: number) => {
        setActiveRailIndex(index);
        setHiddenId(null);
    };

    return (
        // Rendered inside the Hero, where the intro video used to be: no heading of
        // its own (the hero's h1 introduces the page), so the region is labelled
        // directly. `id="portfolio"` keeps the Navbar/Footer anchors working.
        <section
            id="portfolio"
            aria-label="I nostri capolavori"
            // No scroll-mt: html's scroll-padding-top (globals.css) already clears
            // the fixed navbar; the two added up to a 176px offset.
            className={cn('relative', className)}
        >
            {/* Row controls — desktop only, where the gallery is a horizontal row. */}
            <div className="hidden lg:flex justify-end gap-2 mb-4">
                <RowArrow direction="prev" disabled={!canScrollPrev} onClick={() => scrollRow(-1)} />
                <RowArrow direction="next" disabled={!canScrollNext} onClick={() => scrollRow(1)} />
            </div>

            {/* ── Mobile: horizontal snap rail with a sticky title reveal ── */}
            <div className="md:hidden">
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
                            <h3 className="text-2xl font-serif font-bold text-ink truncate">
                                {activeProject?.title}
                            </h3>
                            <p className="text-sm text-accent-ink font-light truncate">
                                {activeProject && cardSubtitle(activeProject)}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                <SnapRail
                    ariaLabel="Progetti in evidenza"
                    itemWidth="85vw"
                    align="center"
                    showDots
                    autoPlay
                    onActiveChange={handleActiveChange}
                    // Cancels the section container's px-4 so the rail's own
                    // centering padding (computed from itemWidth) is what
                    // determines the inset, not a fixed one stacked on top of it.
                    className="-mx-4"
                >
                    {railProjects.map((project, index) => (
                        <MobileProjectCard
                            key={project.id}
                            project={project}
                            eager={index === 0}
                            isActive={index === activeRailIndex}
                            isHidden={hiddenId === project.id}
                            onToggle={() =>
                                setHiddenId((prev) =>
                                    prev === project.id ? null : project.id,
                                )
                            }
                        />
                    ))}
                </SnapRail>
            </div>

            {/* ── Tablet: two-column grid. Desktop (lg+): one horizontal row, four cards
                per view, scrolled with the arrows above (or shift/trackpad). ── */}
            <div
                ref={rowRef}
                data-portfolio-row
                onScroll={updateRowEdges}
                className="hidden md:grid md:grid-cols-2 gap-6 lg:flex lg:overflow-x-auto lg:snap-x lg:snap-mandatory lg:overscroll-x-contain scrollbar-hide"
            >
                {projects.map((project, idx) => (
                    <DesktopProjectCard key={project.id} project={project} index={idx} />
                ))}
            </div>

            <div className="mt-8 text-center">
                <Button
                    asChild
                    variant="secondary"
                    size="lg"
                    className="h-14 px-8 text-base min-w-[300px] border-accent text-accent-ink hover:bg-accent-subtle hover:border-accent rounded-lg transition-all duration-200 active:scale-95 active:bg-accent-subtle"
                >
                    <Link href="/progetti">
                        <LayoutGrid className="mr-2 w-5 h-5" />
                        Visualizza tutti i progetti
                    </Link>
                </Button>
            </div>

        </section>
    );
}
