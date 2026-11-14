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
jest.mock('@/components/ui/open-chat-button', () => ({
    OpenChatButton: ({ children }: { children?: React.ReactNode }) => (
        <button type="button">{children ?? "Parla con l'AI"}</button>
    ),
}));

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
        expect(headings).toContain('Costi & Tempi');
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

    it('shows only the Chiedi a SYD button in the bottom CTA without a phone link', async () => {
        await renderPage();
        expect(screen.getByRole('button', { name: /Chiedi a SYD/i })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Chiama Ora/i })).not.toBeInTheDocument();
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

    it('renders visible breadcrumb nav, promotes CTA heading to h2, and configures overflow-clip + aria-hidden glows', async () => {
        const container = await renderPage();
        const breadcrumb = screen.getByRole('navigation', { name: /Breadcrumb/i });
        expect(breadcrumb).toBeInTheDocument();
        expect(breadcrumb.querySelector('a[href="/"]')).toHaveTextContent(/Home/i);
        expect(breadcrumb).toHaveTextContent(/Domande Frequenti/i);

        expect(screen.getByRole('heading', { level: 2, name: /Non hai trovato la risposta\?/i })).toBeInTheDocument();

        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-clip');
        expect(main).not.toHaveClass('overflow-hidden');

        const glows = container.querySelectorAll('.ambient-glow');
        expect(glows.length).toBeGreaterThanOrEqual(2);
        glows.forEach((glow) => {
            expect(glow).toHaveAttribute('aria-hidden', 'true');
        });
    });

    it('renders quote_terms validity/payments and transparent sections from company info without extra site-visit wording', async () => {
        const container = await renderPage();
        expect(container.textContent).toMatch(/30\s*giorni/i);
        expect(container.textContent).toContain('30% a inizio lavori');
        expect(container.textContent).toContain('50% a metà lavori');
        expect(container.textContent).toContain('20% a fine lavori');
        expect(container.textContent).toContain('bonus fiscali');
        expect(container.textContent).toContain('Classe A1');
    });

    it('renders the SYD agent explanation and the file upload checklist without pre-quote sopralluogo', async () => {
        await renderPage();
        expect(
            screen.getByRole('heading', { level: 2, name: /Cos'è SYD: il nostro assistente AI agentico/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { level: 2, name: /Cosa inviare a SYD per un preventivo preciso/i })
        ).toBeInTheDocument();
        expect(screen.getByText(/3-4 foto dagli angoli/i)).toBeInTheDocument();
        expect(screen.getByText(/Planimetria o schizzo quotato/i)).toBeInTheDocument();
        expect(screen.getByText(/Video panoramico/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Invia i tuoi file a SYD/i })).toBeInTheDocument();
    });
});
