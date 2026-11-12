'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SnapRail } from '@/components/ui/snap-rail';
import { ProjectCard } from '@/components/portfolio/ProjectCard';
import { RowArrow } from '@/components/portfolio/RowArrow';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/lib/reduced-motion';
import { PORTFOLIO_RAIL_LIMIT, withExamples, type PortfolioItem } from '@/lib/portfolio';
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
    // Descriptions are collapsed by default; these track which one (if any) the user
    // has opened. One per layout: the mobile rail and the tablet/desktop grid are
    // both mounted (CSS picks one), and opening a card in one must not touch the other.
    const [openRailId, setOpenRailId] = useState<string | null>(null);
    const [openGridId, setOpenGridId] = useState<string | null>(null);

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

    // Swiping to another card closes the open description (back to the default) — no
    // effect needed, the rail tells us when the active card changes.
    const handleActiveChange = (index: number) => {
        setActiveRailIndex(index);
        setOpenRailId(null);
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
            {/* Header bar: contextual label + desktop row controls */}
            <div className="flex items-center justify-between gap-4 mb-4">
                <p className="text-sm text-ink-muted">
                    <span className="font-semibold text-ink">Progetti in evidenza</span>
                    <span className="hidden sm:inline"> · Clicca su una foto per i dettagli</span>
                </p>
                <div className="hidden lg:flex items-center gap-2 shrink-0">
                    <RowArrow direction="prev" disabled={!canScrollPrev} onClick={() => scrollRow(-1)} />
                    <RowArrow direction="next" disabled={!canScrollNext} onClick={() => scrollRow(1)} />
                </div>
            </div>

            {/* ── Mobile: horizontal snap rail ── */}
            <div className="md:hidden">
                {/* Screen-reader-only progress announcement: the cards show no title,
                    so this is the spoken signal that the swipe moved to a different one. */}
                <p className="sr-only" aria-live="polite">
                    Progetto {activeRailIndex + 1} di {railProjects.length}: {activeProject?.title}
                </p>

                <SnapRail
                    ariaLabel="Progetti in evidenza"
                    itemWidth="85vw"
                    align="center"
                    showDots
                    activeDotClassName="bg-primary"
                    autoPlay
                    onActiveChange={handleActiveChange}
                    // Cancels the section container's px-4 so the rail's own
                    // centering padding (computed from itemWidth) is what
                    // determines the inset, not a fixed one stacked on top of it.
                    className="-mx-4"
                >
                    {railProjects.map((project, index) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            sizes="85vw"
                            eager={index === 0}
                            className="aspect-[3/4] w-full"
                            isOpen={openRailId === project.id}
                            onToggle={() =>
                                setOpenRailId((prev) => (prev === project.id ? null : project.id))
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
                // On desktop the row scrolls sideways and its cards hold no link: focusable,
                // so keyboard users can scroll it with the arrow keys (WCAG 2.1.1).
                role="region"
                aria-label="Progetti"
                tabIndex={0}
                className="hidden md:grid md:grid-cols-2 gap-6 lg:flex lg:overflow-x-auto lg:snap-x lg:snap-mandatory lg:overscroll-x-contain scrollbar-hide rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
                {projects.map((project, idx) => (
                    <ProjectCard
                        key={project.id}
                        project={project}
                        sizes="(max-width: 1024px) 50vw, 25vw"
                        // The row sits in the hero, partly above the fold: its first
                        // cards must load right away.
                        eager={idx < 4}
                        className="aspect-[4/5] lg:w-[calc((100%-4.5rem)/4)] lg:shrink-0 lg:snap-start"
                        isOpen={openGridId === project.id}
                        onToggle={() =>
                            setOpenGridId((prev) => (prev === project.id ? null : project.id))
                        }
                    />
                ))}
            </div>

            <div className="mt-6 text-center">
                <Button
                    asChild
                    variant="secondary"
                    size="default"
                    className="h-11 px-6 text-sm rounded-full border border-line bg-surface text-ink hover:bg-primary-subtle hover:border-primary/50 hover:text-primary-ink transition-colors duration-200 active:scale-95 shadow-xs font-medium"
                >
                    <Link href="/progetti">
                        <LayoutGrid className="mr-2 w-4 h-4" />
                        Visualizza tutti i progetti
                    </Link>
                </Button>
            </div>

        </section>
    );
}
