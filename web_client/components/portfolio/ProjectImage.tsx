import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { projectImageAlt, type PortfolioItem } from '@/lib/portfolio';

/**
 * A project's photo filling its (relative) parent, or a placeholder when the
 * project has none yet — `image` is null then and must never reach next/image.
 */
export function ProjectImage({
    project,
    sizes,
    eager = false,
    className,
}: {
    project: PortfolioItem;
    sizes: string;
    /** The homepage gallery sits in the hero: its first photos are above the fold (and the LCP). */
    eager?: boolean;
    className?: string;
}) {
    if (!project.image) {
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-canvas/80">
                <ImageOff className="w-8 h-8 text-ink-subtle" aria-hidden="true" />
            </div>
        );
    }

    return (
        <Image
            src={project.image}
            alt={projectImageAlt(project)}
            fill
            sizes={sizes}
            loading={eager ? 'eager' : 'lazy'}
            className={className}
        />
    );
}
