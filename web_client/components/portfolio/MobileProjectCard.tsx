'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { M3Duration, M3EasingFM } from '@/lib/m3-motion';
import { triggerHaptic } from '@/lib/haptics';
import type { PortfolioItem } from '@/lib/portfolio';
import { ProjectImage } from './ProjectImage';
import { ProjectStats } from './ProjectStats';

/** A card of the mobile snap rail: tap toggles the description. */
export function MobileProjectCard({
    project,
    eager,
    isActive,
    isHidden,
    onToggle,
}: {
    project: PortfolioItem;
    eager: boolean;
    isActive: boolean;
    isHidden: boolean;
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
            aria-expanded={!isHidden}
            className={cn(
                "relative block w-full aspect-[3/4] rounded-2xl overflow-hidden text-left bg-slate-950 border transition-colors duration-300 cinematic-focus",
                isActive ? "border-luxury-gold/50" : "border-luxury-gold/10"
            )}
        >
            <ProjectImage
                project={project}
                sizes="85vw"
                eager={eager}
                className={cn(
                    "object-cover transition-transform duration-700",
                    isActive ? "scale-105" : "scale-100"
                )}
            />

            {/* The description is visible by default, so the scrim reaches up to 70%
                of the card at rest. Renovation shots are often near-white there, but
                the scrim stays translucent and clears early: the photo is the product. */}
            <span className="absolute inset-0 bg-gradient-to-t from-luxury-bg/75 from-25% to-transparent to-70%" />

            {/* Positioned absolutely, not inside the bottom-anchored column below: there
                it was pushed off the card's top edge whenever the description grew. */}
            <span className="absolute top-4 left-4 z-10 inline-flex px-3 py-1 rounded-full text-xs font-medium bg-luxury-bg/70 backdrop-blur-sm border border-luxury-gold/20 text-luxury-gold">
                {project.category}
            </span>

            <span className="absolute inset-0 p-5 flex flex-col justify-end">
                {/* The reveal follows the user's swipe, not the page scroll. The inherited
                    text-shadow keeps the text legible on a near-white shot without
                    darkening the scrim (which would hide the photo). */}
                <motion.span
                    animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 12 }}
                    transition={{ duration: M3Duration.medium1, ease: M3EasingFM.standard }}
                    className="block [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_2px_10px_rgba(0,0,0,0.6)]"
                >
                    {/* grid-rows 1fr↔0fr animates height without layout-triggering
                        properties (CLS-safe). line-clamp-4 bounds a long real description. */}
                    <span
                        className={cn(
                            "grid transition-[grid-template-rows] duration-300",
                            isHidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                        )}
                    >
                        <span className="block overflow-hidden">
                            <span className="block text-luxury-text/85 text-sm font-light pb-3 line-clamp-4">
                                {project.description}
                            </span>
                        </span>
                    </span>

                    <span className="block text-xs text-luxury-gold/70 font-medium pb-3">
                        {isHidden ? 'Mostra descrizione' : 'Nascondi descrizione'}
                    </span>

                    <ProjectStats stats={project.stats} inline />
                </motion.span>
            </span>

            <span className="sr-only">
                {project.title}, {project.location}. Tocca per {isHidden ? 'mostrare' : 'nascondere'} la descrizione.
            </span>
        </button>
    );
}
