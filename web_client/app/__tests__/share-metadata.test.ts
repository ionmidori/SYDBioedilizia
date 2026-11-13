/**
 * A page that sets its own `openGraph` replaces the layout's whole object (Next
 * does not merge it): without an image of its own the page has no og:image.
 */
import type { Metadata } from 'next';
import { DEFAULT_SHARE_IMAGE } from '@/lib/site-share';
import type { PortfolioItem } from '@/lib/portfolio';

jest.mock('@/lib/portfolio/server', () => ({ getPortfolio: jest.fn() }));
// The pages' UI is irrelevant here and pulls in Firebase/chat modules.
jest.mock('@/components/sections/Navbar', () => ({ Navbar: () => null }));
jest.mock('@/components/sections/Footer', () => ({ Footer: () => null }));
jest.mock('@/components/chat/ChatWidget', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/progetti/ProjectsArchiveClient', () => ({ ProjectsArchiveClient: () => null }));

import { getPortfolio } from '@/lib/portfolio/server';
import { metadata as faqMetadata } from '@/app/faq/page';
import { generateMetadata as progettiMetadata } from '@/app/progetti/page';

const mockGetPortfolio = getPortfolio as jest.MockedFunction<typeof getPortfolio>;

const project: PortfolioItem = {
    id: 'p1',
    title: 'Bagno terracotta',
    category: 'Bagno',
    location: 'Roma',
    image: 'https://storage.example/portfolio/bagno.webp',
    description: 'Descrizione',
    stats: { area: '', duration: '', budget: '' },
};

function images(meta: Metadata) {
    return { og: meta.openGraph?.images, twitter: meta.twitter?.images };
}

describe('link preview of pages with their own OpenGraph', () => {
    it('/faq shows the brand logo, with the FAQ title and URL', () => {
        expect(images(faqMetadata)).toEqual({ og: [DEFAULT_SHARE_IMAGE], twitter: [DEFAULT_SHARE_IMAGE.url] });
        expect(faqMetadata.openGraph).toMatchObject({
            title: 'Domande Frequenti (FAQ) | SYD Bioedilizia',
            url: 'https://sydbioedilizia.vercel.app/faq',
        });
        expect(faqMetadata.alternates).toEqual({ canonical: '/faq' });
    });

    it('/progetti shows the photo of the first real project', async () => {
        mockGetPortfolio.mockResolvedValue([project]);
        const meta = await progettiMetadata();
        expect(images(meta).og).toEqual([{ url: project.image, alt: 'Bagno terracotta · Bagno, Roma' }]);
        expect(images(meta).twitter).toEqual([project.image]);
        expect(meta.openGraph).toMatchObject({ url: 'https://sydbioedilizia.vercel.app/progetti' });
        expect(meta.alternates).toEqual({ canonical: '/progetti' });
    });

    it('/progetti falls back to the brand logo with no real project', async () => {
        mockGetPortfolio.mockResolvedValue([]);
        const meta = await progettiMetadata();
        expect(images(meta)).toEqual({ og: [DEFAULT_SHARE_IMAGE], twitter: [DEFAULT_SHARE_IMAGE.url] });
    });
});
