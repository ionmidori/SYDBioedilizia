/**
 * Schema.org data for the portfolio (JSON-LD), so search and answer engines can
 * read each project and its photo. Only REAL projects are described: the
 * example cards are stock photography and must never be presented as our work —
 * pass the backend's projects here, never the output of `withExamples`.
 */
import { COMPANY } from '@/lib/company';
import { projectImageAlt } from './presentation';
import type { PortfolioCard, PortfolioItem } from './types';

/** `@id` of the business node published by the homepage JSON-LD (app/page.tsx). */
const BUSINESS_ID = `${COMPANY.url}/#business`;

export function portfolioItemList(
    // `isExample?: never`: passing the output of withExamples() is a type error.
    projects: ReadonlyArray<PortfolioItem & { isExample?: never }>,
): Record<string, unknown> | null {
    // Defence in depth at runtime too (e.g. data that went through `as`).
    const real = projects.filter((p) => !(p as Partial<PortfolioCard>).isExample);
    if (real.length === 0) return null;
    return {
        '@type': 'ItemList',
        numberOfItems: real.length,
        itemListElement: real.map((project, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
                '@type': 'CreativeWork',
                name: project.title,
                ...(project.description && { description: project.description }),
                genre: project.category,
                creator: { '@id': BUSINESS_ID },
                ...(project.location && {
                    contentLocation: { '@type': 'Place', name: project.location },
                }),
                ...(project.image && {
                    image: {
                        '@type': 'ImageObject',
                        contentUrl: project.image,
                        caption: projectImageAlt(project),
                    },
                }),
            },
        })),
    };
}

/**
 * JSON for a `<script type="application/ld+json">`. The content comes from the
 * database, so `<` is escaped: a "</script>" in a description cannot close the tag.
 */
export function serializeJsonLd(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Link-preview image for the homepage: the photo of the first real project with
 * one, or null (the caller keeps the default logo). Real projects only, like the
 * JSON-LD above.
 */
export function portfolioShareImage(
    projects: ReadonlyArray<PortfolioItem & { isExample?: never }>,
): { url: string; alt: string } | null {
    const withPhoto = projects.find((p) => !(p as Partial<PortfolioCard>).isExample && p.image);
    return withPhoto?.image ? { url: withPhoto.image, alt: projectImageAlt(withPhoto) } : null;
}
