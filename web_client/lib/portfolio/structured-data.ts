/**
 * Schema.org data for the portfolio (JSON-LD), so search and answer engines can
 * read each project and its photo. Only REAL projects are described: the
 * placeholder set is stock photography and must never be presented as our work.
 */
import { COMPANY } from '@/lib/company';
import { projectImageAlt } from './presentation';
import type { PortfolioData } from './types';

/** `@id` of the business node published by the homepage JSON-LD (app/page.tsx). */
const BUSINESS_ID = `${COMPANY.url}/#business`;

export function portfolioItemList(data: PortfolioData): Record<string, unknown> | null {
    if (data.isFallback || data.projects.length === 0) return null;
    return {
        '@type': 'ItemList',
        numberOfItems: data.projects.length,
        itemListElement: data.projects.map((project, index) => ({
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
