'use client';

import { useId } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { EXAMPLE_LABEL, cardAccessibleName, type PortfolioCard } from '@/lib/portfolio';
import { ProjectImage } from './ProjectImage';

/**
 * A card of the homepage gallery (mobile rail, tablet grid and desktop row alike).
 *
 * The photo is the whole card: no scrim, no dimming, no title/place/stats over it.
 * The only text is the project's description, collapsed by default and opened with
 * a click/tap on the card. It sits on a solid panel instead of a gradient, so it is
 * legible on any photo without washing the photo out.
 *
 * Nothing here animates `opacity`: the panel is revealed with a height transition
 * (grid-rows 0fr↔1fr, CLS-safe), and `visibility` keeps the collapsed text out of
 * the accessibility tree.
 */
export function ProjectCard({
    project,
    isOpen,
    onToggle,
    sizes,
    eager = false,
    className,
}: {
    project: PortfolioCard;
    isOpen: boolean;
    onToggle: () => void;
    /** `sizes` hint for next/image, matching the width the parent gives the card. */
    sizes: string;
    /** The first photos sit in the hero, above the fold (and are the LCP). */
    eager?: boolean;
    /** Sizing from the layout (aspect ratio, width, snap alignment). */
    className?: string;
}) {
    const descriptionId = useId();

    const handleToggle = () => {
        triggerHaptic();
        onToggle();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Escape' && isOpen) {
            event.stopPropagation();
            onToggle();
        }
    };

    return (
        <button
            type="button"
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            aria-expanded={isOpen}
            // An explicit name: computed from content it would repeat the photo's alt
            // text and, once open, read the whole description as part of the name.
            aria-label={`${cardAccessibleName(project)}. ${isOpen ? 'Nascondi' : 'Mostra'} la descrizione.`}
            // Only while it is shown: a hidden description must not be announced.
            aria-describedby={isOpen ? descriptionId : undefined}
            className={cn(
                'group relative block overflow-hidden rounded-2xl border border-line bg-surface-muted text-left',
                // No `cinematic-focus`: its focus-within scale(1.02) is only neutralised
                // inside a SnapRail item, so on the desktop row (overflow-x: auto clips
                // vertically too) a clicked card would grow and be cropped.
                'transition-colors hover:border-accent',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                className,
            )}
        >
            <ProjectImage
                project={project}
                sizes={sizes}
                eager={eager}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />

            {/* Always visible, not only on open: an example must never pass for our work. */}
            {project.isExample && (
                <span className="absolute left-3 top-3 z-10 inline-flex rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-accent-ink shadow-1">
                    {EXAMPLE_LABEL}
                </span>
            )}

            <span className="absolute inset-x-3 bottom-3 z-10 flex flex-col items-start gap-2">
                <span
                    className={cn(
                        'grid w-full transition-[grid-template-rows,visibility] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                        isOpen ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
                    )}
                >
                    <span className="block overflow-hidden rounded-xl">
                        <span className="block rounded-xl border border-line bg-canvas p-4 shadow-2">
                            {/* line-clamp on its own element: with padding on the same
                                one, a clamped line would peek through the padding. */}
                            <span
                                id={descriptionId}
                                className="line-clamp-6 block text-sm font-light leading-relaxed text-ink"
                            >
                                {project.description}
                            </span>
                        </span>
                    </span>
                </span>

                {/* Visual affordance only — the whole card is the button. */}
                <span
                    aria-hidden="true"
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-canvas pl-4 pr-3 text-sm font-medium text-ink shadow-1 transition-colors group-hover:border-accent"
                >
                    {isOpen ? 'Chiudi' : 'Descrizione'}
                    <Plus
                        className={cn(
                            'h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                            isOpen && 'rotate-45',
                        )}
                    />
                </span>
            </span>
        </button>
    );
}

