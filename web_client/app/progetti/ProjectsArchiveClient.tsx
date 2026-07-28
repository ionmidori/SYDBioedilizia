'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ImageOff, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ALL_CATEGORIES,
    defaultProjects,
    deriveCategories,
    fetchPortfolio,
    filterByCategory,
    type PortfolioItem,
} from '@/lib/portfolio';

export function ProjectsArchiveClient() {
    const [projects, setProjects] = useState<PortfolioItem[]>(defaultProjects);
    const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);

    useEffect(() => {
        fetchPortfolio().then(setProjects);
    }, []);

    const categories = deriveCategories(projects);
    const filtered = filterByCategory(projects, activeCategory);

    return (
        <section className="py-12 md:py-20">
            <div className="container mx-auto px-4 md:px-6">

                <header className="mb-8 md:mb-12">
                    <h1 className="text-3xl md:text-5xl font-serif font-bold text-luxury-text mb-4">
                        Tutti i <span className="text-luxury-gold italic">Progetti</span>
                    </h1>
                    <p className="text-luxury-text/70 max-w-xl text-lg font-light">
                        L&apos;archivio completo delle nostre ristrutturazioni. Filtra per ambiente
                        per trovare il progetto più vicino al tuo.
                    </p>
                </header>

                <div
                    className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap mb-8"
                    role="group"
                    aria-label="Filtra per categoria"
                >
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            aria-pressed={activeCategory === cat}
                            className={cn(
                                'shrink-0 px-4 min-h-[44px] rounded-full text-sm font-medium transition-all duration-300 border',
                                activeCategory === cat
                                    ? 'bg-luxury-gold text-luxury-bg border-luxury-gold'
                                    : 'bg-transparent text-luxury-text/60 border-luxury-gold/20 hover:border-luxury-gold/50 hover:text-luxury-text',
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <p className="text-sm text-luxury-text/50 mb-6" aria-live="polite">
                    {filtered.length} {filtered.length === 1 ? 'progetto' : 'progetti'}
                </p>

                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-luxury-text/10 bg-luxury-bg/20 py-16 px-6 text-center">
                        <p className="text-luxury-text/60 text-sm mb-4">
                            Nessun progetto nella categoria &laquo;{activeCategory}&raquo;.
                        </p>
                        <button
                            onClick={() => setActiveCategory(ALL_CATEGORIES)}
                            className="min-h-[44px] px-5 rounded-full bg-luxury-gold text-luxury-bg text-sm font-bold transition-colors hover:bg-luxury-gold/90"
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

function ArchiveCard({ project }: { project: PortfolioItem }) {
    return (
        <article className="group h-full overflow-hidden rounded-2xl border border-luxury-gold/10 bg-luxury-bg/40 transition-colors hover:border-luxury-gold/40">
            <div className="relative aspect-[4/3] bg-slate-950">
                {project.image ? (
                    <Image
                        src={project.image}
                        alt={project.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ImageOff className="w-8 h-8 text-luxury-text/20" aria-hidden="true" />
                    </div>
                )}
                <span className="absolute top-3 left-3 rounded-full border border-luxury-gold/20 bg-luxury-bg/80 px-3 py-1 text-xs font-medium text-luxury-gold backdrop-blur-sm">
                    {project.category}
                </span>
            </div>

            <div className="p-5">
                <h2 className="font-serif text-xl font-bold text-luxury-text mb-1">
                    {project.title}
                </h2>

                {project.location && (
                    <p className="flex items-center gap-1.5 text-sm text-luxury-text/50 mb-3">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        {project.location}
                    </p>
                )}

                <p className="text-sm font-light leading-relaxed text-luxury-text/70 mb-4">
                    {project.description}
                </p>

                <dl className="flex gap-4 border-t border-luxury-text/10 pt-3">
                    {([
                        ['Area', project.stats.area],
                        ['Tempo', project.stats.duration],
                        ['Budget', project.stats.budget],
                    ] as const).map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-[10px] uppercase tracking-wider text-luxury-gold/80">
                                {label}
                            </dt>
                            <dd className="text-xs font-medium text-luxury-text">{value || '—'}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </article>
    );
}
