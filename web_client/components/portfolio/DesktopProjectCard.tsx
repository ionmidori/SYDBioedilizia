'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { EXAMPLE_LABEL, cardShowsStats, type PortfolioCard } from '@/lib/portfolio';
import { ProjectImage } from './ProjectImage';
import { ProjectStats } from './ProjectStats';

/** A card of the tablet grid / desktop row: details reveal on hover. */
export function DesktopProjectCard({ project, index }: { project: PortfolioCard; index: number }) {
    return (
        <motion.article
            // Opacity only: on lg the row scrolls horizontally, so it also clips
            // vertically (overflow-x: auto forces overflow-y) and a slide-up entry
            // showed the cards with their bottom cut off.
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            // Capped: cards further along the row reveal as they are scrolled in,
            // and shouldn't then wait a second for their turn.
            transition={{ duration: 0.5, delay: Math.min(index, 3) * 0.1, ease: 'easeOut' }}
            // No negative margin: the row sits in the hero, partly above the fold,
            // and must not wait for a scroll to show its first cards.
            viewport={{ once: true, amount: 0.2 }}
            className="group relative aspect-[4/5] lg:shrink-0 lg:snap-start lg:w-[calc((100%-4.5rem)/4)] rounded-2xl overflow-hidden cursor-pointer bg-shade border border-line hover:border-accent transition-colors"
        >
            <ProjectImage
                project={project}
                sizes="(max-width: 1024px) 50vw, 25vw"
                eager={index < 4}
                className="object-cover transition-transform duration-700 group-hover:scale-110"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

            {/* Always visible, not only on hover: an example must never pass for our work. */}
            {project.isExample && (
                <span className="absolute top-4 left-4 z-20 inline-flex px-3 py-1 rounded-full text-xs font-medium bg-canvas/70 backdrop-blur-sm border border-line text-accent-ink">
                    {EXAMPLE_LABEL}
                </span>
            )}

            <div className="absolute inset-0 p-6 flex flex-col justify-end translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                <div className="relative z-20">
                    <p className="text-accent-ink text-sm font-medium mb-2 -translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 delay-75">
                        {project.category}
                    </p>

                    <h2 className="text-2xl font-bold text-ink mb-2">{project.title}</h2>

                    {/* grid-rows trick: animates height without touching layout-triggering properties */}
                    <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-300 delay-100">
                        <div className="overflow-hidden">
                            <p className="text-ink text-sm mb-4 font-light">
                                {project.description}
                            </p>
                            {cardShowsStats(project) && <ProjectStats stats={project.stats} />}
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-200">
                <div className="w-10 h-10 rounded-full bg-primary-subtle backdrop-blur-md flex items-center justify-center border border-primary text-ink hover:bg-primary hover:text-on-primary transition-colors">
                    <ArrowUpRight className="w-5 h-5" aria-hidden="true" />
                </div>
            </div>
        </motion.article>
    );
}
