'use client';

import { useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { ProjectImage } from '@/components/portfolio/ProjectImage';
import { ProjectStats } from '@/components/portfolio/ProjectStats';
import { cn } from '@/lib/utils';
import {
    ALL_CATEGORIES,
    EXAMPLE_LABEL,
    cardBadge,
    cardShowsStats,
    deriveCategories,
    filterByCategory,
    withExamples,
    type PortfolioCard,
    type PortfolioItem,
} from '@/lib/portfolio';
import { usePortfolioProjects } from '@/lib/portfolio/use-portfolio-projects';

/** "1 progetto", "3 progetti", plus the examples when there are some. */
function countLabel(cards: PortfolioCard[]): string {
    const examples = cards.filter((c) => c.isExample).length;
    const real = cards.length - examples;
    const projects = `${real} ${real === 1 ? 'progetto' : 'progetti'}`;
    return examples > 0 ? `${projects} · ${examples} ${examples === 1 ? 'esempio' : 'esempi'}` : projects;
}

export function ProjectsArchiveClient({ initial }: { initial?: PortfolioItem[] }) {
    const realProjects = usePortfolioProjects(initial);
    // Real projects first, then labelled examples up to PORTFOLIO_MIN_CARDS.
    const cards = useMemo(() => withExamples(realProjects), [realProjects]);
    const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);

    // Filters come from REAL projects only: a chip must never advertise a kind of
    // work that only a stock example shows. Examples appear under "Tutti" only.
    const categories = deriveCategories(realProjects);
    const filtered =
        activeCategory === ALL_CATEGORIES
            ? cards
            : filterByCategory(cards.filter((c) => !c.isExample), activeCategory);
    const hasExamples = cards.some((c) => c.isExample);

    return (
        <section className="py-12 md:py-20">
            <div className="container mx-auto px-4 md:px-6">

                <header className="mb-8 md:mb-12">
                    <h1 className="text-3xl md:text-5xl font-serif font-bold text-ink mb-4">
                        Tutti i <span className="text-primary-ink italic">Progetti</span>
                    </h1>
                    <p className="text-ink-muted max-w-xl text-lg font-light">
                        L&apos;archivio completo delle nostre ristrutturazioni. Filtra per ambiente
                        per trovare il progetto più vicino al tuo.
                    </p>
                    {hasExamples && (
                        <p className="mt-3 max-w-xl text-sm text-ink-muted">
                            Le schede «{EXAMPLE_LABEL}» sono foto di riferimento per lo stile, non
                            lavori realizzati da noi: lasciano il posto ai nostri progetti man mano
                            che li pubblichiamo.
                        </p>
                    )}
                </header>

                <div
                    className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap mb-8"
                    role="group"
                    aria-label="Filtra per categoria"
                >
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => setActiveCategory(cat)}
                            aria-pressed={activeCategory === cat}
                            className={cn(
                                'shrink-0 px-4 min-h-[44px] rounded-full text-sm font-medium transition-all duration-300 border shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                                activeCategory === cat
                                    ? 'bg-primary text-on-primary border-primary font-semibold'
                                    : 'bg-surface text-ink-muted border-line hover:border-primary/50 hover:text-ink',
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <p className="text-sm text-ink-muted mb-6" aria-live="polite">
                    {countLabel(filtered)}
                </p>

                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas/20 py-16 px-6 text-center">
                        <p className="text-ink-muted text-sm mb-4">
                            Nessun progetto nella categoria &laquo;{activeCategory}&raquo;.
                        </p>
                        <button
                            type="button"
                            onClick={() => setActiveCategory(ALL_CATEGORIES)}
                            className="min-h-[44px] px-5 rounded-full border border-transparent bg-primary text-on-primary text-sm font-bold transition-colors hover:bg-primary-hover shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                        >
                            Mostra tutti
                        </button>
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filtered.map((project) => (
                            <li key={project.id}>
                                <ArchiveCard project={project} />
                            </li>
                        ))}
                    </ul>
                )}

            </div>
        </section>
    );
}

function ArchiveCard({ project }: { project: PortfolioCard }) {
    return (
        <article className="group h-full overflow-hidden rounded-2xl border border-line bg-canvas/40 transition-colors hover:border-accent">
            <div className="relative aspect-[4/3] bg-shade">
                <ProjectImage
                    project={project}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute top-3 left-3 rounded-full border border-line bg-canvas/80 px-3 py-1 text-xs font-medium text-accent-ink backdrop-blur-sm">
                    {cardBadge(project)}
                </span>
            </div>

            <div className="p-5">
                <h2 className="font-serif text-xl font-bold text-ink mb-1">
                    {project.title}
                </h2>

                {!project.isExample && project.location && (
                    <p className="flex items-center gap-1.5 text-sm text-ink-muted mb-3">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        {project.location}
                    </p>
                )}

                <p className="text-sm font-light leading-relaxed text-ink-muted mb-4">
                    {project.description}
                </p>

                {/* Examples carry no measures: nothing to show, nothing invented. */}
                {cardShowsStats(project) && <ProjectStats stats={project.stats} />}
            </div>
        </article>
    );
}
