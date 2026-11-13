import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { metadata as rootMetadata } from '@/app/layout';
import { generateMetadata as homeMetadata } from '@/app/page';
import ChiSiamoPage, { metadata as chiSiamoMetadata } from '@/app/chi-siamo/page';
import { metadata as faqMetadata } from '@/app/faq/page';
import { metadata as blogIndexMetadata } from '@/app/blog/page';
import { generateMetadata as progettiMetadata } from '@/app/progetti/page';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { BLOG_POSTS } from '@/lib/blog';
import { blogPostMetadata } from '@/lib/blog/seo';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { getCompanyInfo } from '@/lib/company-info/server';
import { getPortfolio } from '@/lib/portfolio/server';
import { SITE_URL } from '@/lib/site';

jest.mock('@/lib/company-info/server', () => ({ getCompanyInfo: jest.fn() }));
jest.mock('@/lib/portfolio/server', () => ({ getPortfolio: jest.fn().mockResolvedValue([]) }));
jest.mock('@/components/sections/Navbar', () => ({ Navbar: () => null }));
jest.mock('@/components/sections/About', () => ({ About: () => null }));
jest.mock('@/components/sections/Hero', () => ({ Hero: () => null }));
jest.mock('@/components/sections/Services', () => ({ Services: () => null }));
jest.mock('@/components/sections/WhatWeDo', () => ({ WhatWeDo: () => null }));
jest.mock('@/components/sections/Testimonials', () => ({ Testimonials: () => null }));
jest.mock('@/components/sections/Footer', () => ({ Footer: () => null }));
jest.mock('@/components/chat/ChatWidget', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/progetti/ProjectsArchiveClient', () => ({ ProjectsArchiveClient: () => null }));
jest.mock('@/components/providers/AppCheckProvider', () => ({ AppCheckProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/providers/AuthProvider', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/providers/QueryProvider', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/providers/CompanyIdentityProvider', () => ({ CompanyIdentityProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@/components/chat/ChatProvider', () => ({ ChatProvider: ({ children }: { children: ReactNode }) => children }));
jest.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }));
jest.mock('@vercel/analytics/next', () => ({ Analytics: () => null }));
jest.mock('next/font/google', () => ({
  Playfair_Display: () => ({ variable: '--font-face-serif' }),
  Lato: () => ({ variable: '--font-face-sans' }),
  Red_Hat_Display: () => ({ variable: '--font-face-brand' }),
}));

describe('SEO metadata core', () => {
  beforeEach(() => {
    (getCompanyInfo as jest.Mock).mockResolvedValue(SEED_COMPANY_INFO);
    (getPortfolio as jest.Mock).mockResolvedValue([]);
  });

  it('does not set a root canonical in layout.tsx and uses a 130-165 char description', () => {
    expect(rootMetadata.alternates?.canonical).toBeUndefined();
    expect(rootMetadata.description!.length).toBeGreaterThanOrEqual(130);
    expect(rootMetadata.description!.length).toBeLessThanOrEqual(165);
  });

  it('sets canonical "/" explicitly on home page', async () => {
    const meta = await homeMetadata();
    expect(meta.alternates?.canonical).toBe('/');
  });

  it('avoids double brand suffixes on page titles while keeping OG brand', async () => {
    const projMeta = await progettiMetadata();
    expect(String(faqMetadata.title)).not.toMatch(/SYD/i);
    expect(String(projMeta.title)).not.toMatch(/SYD/i);
    expect(String(blogIndexMetadata.title)).not.toMatch(/SYD/i);
    expect(String(chiSiamoMetadata.title)).not.toMatch(/SYD/i);
  });

  it('gives /blog and /blog/[slug] full openGraph and twitter metadata', () => {
    expect(blogIndexMetadata.openGraph?.url).toBe(`${SITE_URL}/blog`);
    expect(blogIndexMetadata.twitter?.card).toBe('summary_large_image');

    const postMeta = blogPostMetadata(BLOG_POSTS[0]);
    expect(postMeta.twitter).toMatchObject({
      card: 'summary_large_image',
      title: expect.any(String),
      description: expect.any(String),
      images: [BLOG_POSTS[0].image],
    });
  });

  it('gives /chi-siamo metadata and AboutPage + BreadcrumbList JSON-LD', async () => {
    expect(chiSiamoMetadata.alternates?.canonical).toBe('/chi-siamo');
    expect(chiSiamoMetadata.openGraph?.url).toBe(`${SITE_URL}/chi-siamo`);
    const { container } = render(await ChiSiamoPage());
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    const types = ld['@graph'].map((n: { '@type': string }) => n['@type']);
    expect(types).toEqual(['AboutPage', 'BreadcrumbList']);
  });

  it('uses SITE_URL in robots and deterministic static lastModified dates in sitemap', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-11-13T10:00:00.000Z'));
      const firstRun = sitemap();
      jest.setSystemTime(new Date('2026-11-13T10:05:00.000Z'));
      const secondRun = sitemap();
      const homeEntry = firstRun.find((e) => e.url === SITE_URL)!;
      const secondRunHome = secondRun.find((e) => e.url === SITE_URL)!;
      expect(new Date(homeEntry.lastModified!).getTime()).toBe(new Date(secondRunHome.lastModified!).getTime());
    } finally {
      jest.useRealTimers();
    }
  });
});
