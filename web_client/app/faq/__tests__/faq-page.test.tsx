import { render, screen } from '@testing-library/react';
import FAQPage from '@/app/faq/page';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { getCompanyInfo } from '@/lib/company-info/server';
import { SITE_URL } from '@/lib/site';
import { TEST_IDENTITY } from '@/test-utils/company';
import type { CompanyInfo } from '@/types/company-info';

jest.mock('@/lib/company-info/server', () => ({ getCompanyInfo: jest.fn() }));
jest.mock('@/components/sections/Navbar', () => ({ Navbar: () => null }));
jest.mock('@/components/sections/Footer', () => ({ Footer: () => null }));
jest.mock('@/components/chat/ChatWidget', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ui/open-chat-button', () => ({ OpenChatButton: () => <button>Parla con l&apos;AI</button> }));

const info: CompanyInfo = {
    ...SEED_COMPANY_INFO,
    identity: TEST_IDENTITY,
    faq_categories: [
        { name: 'Costi & Tempi', icon: 'Coins' },
        { name: 'Categoria vuota', icon: 'Clock' },
    ],
    faq: [
        { slug: 'uno', question: 'Quanto costa?', category: 'Costi & Tempi', answer: [{ type: 'p', text: 'Dipende **molto**.' }] },
        { slug: 'due', question: 'Quanto dura?', category: 'Costi & Tempi', answer: [{ type: 'ul', items: ['Poco', 'Tanto'] }] },
    ],
};

async function renderPage() {
    (getCompanyInfo as jest.Mock).mockResolvedValue(info);
    const { container } = render(await FAQPage());
    return container;
}

const jsonLd = (container: HTMLElement) =>
    JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);

describe('/faq page', () => {
    it('shows the categories of the company info that have questions, in their order', async () => {
        await renderPage();
        const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
        expect(headings).toEqual(['Costi & Tempi']);
        expect(screen.getByText('Quanto costa?')).toBeInTheDocument();
        expect(screen.getByText('Quanto dura?')).toBeInTheDocument();
        expect(screen.queryByText('Categoria vuota')).not.toBeInTheDocument();
    });

    it('describes the same questions in the FAQPage JSON-LD, with the site URL in the breadcrumbs', async () => {
        const graph = jsonLd(await renderPage())['@graph'];
        const faq = graph.find((g: { '@type': string }) => g['@type'] === 'FAQPage');
        expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(['Quanto costa?', 'Quanto dura?']);
        expect(faq.mainEntity[0].acceptedAnswer.text).toBe('Dipende molto.');
        const crumbs = graph.find((g: { '@type': string }) => g['@type'] === 'BreadcrumbList');
        expect(crumbs.itemListElement.map((c: { item: string }) => c.item)).toEqual([SITE_URL, `${SITE_URL}/faq`]);
    });

    it('calls the phone of the company info', async () => {
        await renderPage();
        expect(screen.getByRole('link', { name: /Chiama Ora/ })).toHaveAttribute('href', 'tel:+39061234567');
    });

    it('does not offer a site visit before the quote (the visit is asked for after it)', async () => {
        const container = await renderPage();
        expect(container.textContent).not.toMatch(/sopralluogo/i);
    });

    it('keeps a question written with </script> inert in the JSON-LD (the console edits this text)', async () => {
        const hostile = 'Domanda </script><script>alert(1)</script> <!-- fine';
        (getCompanyInfo as jest.Mock).mockResolvedValue({
            ...info,
            faq: [{ ...info.faq[0], question: hostile, answer: [{ type: 'p', text: hostile }] }],
        });
        const { container } = render(await FAQPage());

        expect(container.querySelectorAll('script')).toHaveLength(1);
        const script = container.querySelector('script[type="application/ld+json"]')!;
        expect(script.textContent).not.toMatch(/<\/script|<!--/i);
        const faq = JSON.parse(script.textContent!)['@graph'][0];
        expect(faq.mainEntity[0].name).toBe(hostile);
        expect(faq.mainEntity[0].acceptedAnswer.text).toBe(hostile);
    });
});
