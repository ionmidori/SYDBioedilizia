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
    projects: ReadonlyArray<PortfolioItem | PortfolioCard>,
): Record<string, unknown> | null {
    // Defence in depth: drop examples even if cards were passed by mistake.
    const real = projects.filter((p) => !('isExample' in p && p.isExample));
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
