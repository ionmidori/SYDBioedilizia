import { fireEvent, render, screen } from '@testing-library/react';
import { FAQExplorer } from '@/components/faq/FAQExplorer';
import { buildFaqSections, toSectionId } from '@/lib/company-info/faq-sections';
import type { FaqCategory, FaqItem } from '@/types/company-info';

jest.mock('@/lib/chat-events', () => ({
    openChat: jest.fn(),
}));

const categories: FaqCategory[] = [
    { name: 'Costi & Tempi', icon: 'Coins' },
    { name: 'Permessi & Normative!', icon: 'FileText' },
    { name: 'Categoria Vuota', icon: 'Clock' },
];

const faq: FaqItem[] = [
    {
        slug: 'costo-mq',
        question: 'Quanto costa al mq?',
        category: 'Costi & Tempi',
        answer: [{ type: 'lead', text: 'Tra 800€ e 1.200€ con **materiali certificati**.' }],
    },
    {
        slug: 'cila-scia',
        question: 'Quando serve la CILA?',
        category: 'Permessi & Normative!',
        answer: [{ type: 'p', text: 'Per spostare tramezzi senza toccare muri portanti.' }],
    },
];

describe('toSectionId & buildFaqSections', () => {
    it('strips leading/trailing dashes and accents while excluding empty categories', () => {
        expect(toSectionId('Permessi & Normative!')).toBe('permessi-normative');
        expect(toSectionId('Efficienza & Qualità')).toBe('efficienza-qualita');

        const sections = buildFaqSections(categories, faq);
        expect(sections.map((s) => s.sectionId)).toEqual(['costi-tempi', 'permessi-normative']);
    });
});

describe('FAQExplorer', () => {
    it('filters questions by text inside answer blocks and updates live count', () => {
        const sections = buildFaqSections(categories, faq);
        render(<FAQExplorer sections={sections} />);

        const search = screen.getByRole('searchbox', { name: /Cerca nelle domande frequenti/i });
        fireEvent.change(search, { target: { value: 'tramezzi' } });

        expect(screen.getByText('Quando serve la CILA?')).toBeInTheDocument();
        expect(screen.queryByText('Quanto costa al mq?')).not.toBeInTheDocument();
        expect(screen.getByText(/1 risultato/i)).toBeInTheDocument();
    });

    it('renders an empty state with prefilled OpenChatButton when nothing matches', () => {
        const sections = buildFaqSections(categories, faq);
        render(<FAQExplorer sections={sections} />);

        const search = screen.getByRole('searchbox', { name: /Cerca nelle domande frequenti/i });
        fireEvent.change(search, { target: { value: 'domotica knx' } });

        expect(screen.getByText(/Nessuna FAQ trovata per/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Chiedi a SYD/i })).toBeInTheDocument();
    });

    it('filters by category pill with aria-pressed and expands/collapses all visible items', () => {
        const sections = buildFaqSections(categories, faq);
        render(<FAQExplorer sections={sections} />);

        const catBtn = screen.getByRole('button', { name: /Permessi & Normative!/i });
        fireEvent.click(catBtn);

        expect(catBtn).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Quando serve la CILA?')).toBeInTheDocument();
        expect(screen.queryByText('Quanto costa al mq?')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Tutte$/i }));
        expect(screen.getByText('Quanto costa al mq?')).toBeInTheDocument();

        const expandAll = screen.getByRole('button', { name: /Espandi tutte/i });
        fireEvent.click(expandAll);

        expect(screen.getByRole('button', { name: /Comprimi tutte/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Quanto costa al mq?' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: 'Quando serve la CILA?' })).toHaveAttribute('aria-expanded', 'true');
    });
});
