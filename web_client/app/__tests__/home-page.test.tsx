import { render } from '@testing-library/react';
import Home from '@/app/page';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { getCompanyInfo } from '@/lib/company-info/server';
import { SITE_URL } from '@/lib/site';
import type { CompanyInfo } from '@/types/company-info';

jest.mock('@/lib/company-info/server', () => ({ getCompanyInfo: jest.fn() }));
jest.mock('@/lib/portfolio/server', () => ({ getPortfolio: jest.fn().mockResolvedValue([]) }));
jest.mock('@/components/sections/Navbar', () => ({ Navbar: () => null }));
jest.mock('@/components/sections/Hero', () => ({ Hero: () => null }));
jest.mock('@/components/sections/Services', () => ({ Services: ({ items }: { items: unknown[] }) => <i data-cards={items.length} /> }));
jest.mock('@/components/sections/WhatWeDo', () => ({ WhatWeDo: () => null }));
jest.mock('@/components/sections/Testimonials', () => ({ Testimonials: () => null }));
jest.mock('@/components/sections/Footer', () => ({ Footer: () => null }));
jest.mock('@/components/chat/ChatWidget', () => ({ __esModule: true, default: () => null }));

async function renderHome(info: CompanyInfo) {
    (getCompanyInfo as jest.Mock).mockResolvedValue(info);
    return render(await Home());
}

describe('home page', () => {
    it('describes the business of the company info in its JSON-LD', async () => {
        const { container } = await renderHome(SEED_COMPANY_INFO);
        const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
        expect(ld['@id']).toBe(`${SITE_URL}/#business`);
        expect(ld.telephone).toBe(SEED_COMPANY_INFO.identity.phone);
        expect(ld.areaServed).toHaveLength(SEED_COMPANY_INFO.service_area.places.length + 1);
    });

    it('hands the service cards of the company info to the Services section', async () => {
        const { container } = await renderHome(SEED_COMPANY_INFO);
        expect(container.querySelector('[data-cards]')).toHaveAttribute(
            'data-cards',
            String(SEED_COMPANY_INFO.home_services.length),
        );
    });

    it('keeps a text written with </script> inert in the JSON-LD (the console edits it)', async () => {
        const hostile = 'Lavori </script><script>alert(1)</script> <!-- fine';
        const { container } = await renderHome({
            ...SEED_COMPANY_INFO,
            services: { ...SEED_COMPANY_INFO.services, summary: hostile },
        });

        expect(container.querySelectorAll('script')).toHaveLength(1);
        const script = container.querySelector('script[type="application/ld+json"]')!;
        expect(script.textContent).not.toMatch(/<\/script|<!--/i);
        expect(JSON.parse(script.textContent!).description).toBe(hostile);
    });
});
