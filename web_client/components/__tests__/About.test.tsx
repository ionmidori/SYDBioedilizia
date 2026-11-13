import { fireEvent, render, screen, within } from '@testing-library/react';
import { About } from '@/components/sections/About';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { openChat } from '@/lib/chat-events';

jest.mock('@/lib/chat-events', () => ({ openChat: jest.fn() }));

const { about, services } = SEED_COMPANY_INFO;

describe('About (/chi-siamo)', () => {
    beforeEach(() => (openChat as jest.Mock).mockClear());

    it('shows the title, subtitle and excellences of the company info', () => {
        render(<About about={about} services={services.items} />);
        expect(screen.getByRole('heading', { level: 1, name: about.title })).toBeInTheDocument();
        expect(screen.getByText(about.subtitle)).toBeInTheDocument();
        for (const excellence of about.excellences) {
            expect(screen.getByText(excellence.title, { exact: false })).toBeInTheDocument();
        }
    });

    it('lists every work of the company info, not a fixed list', () => {
        render(<About about={about} services={[{ title: 'Lavoro di prova', description: '' }]} />);
        expect(screen.getByText('Lavoro di prova')).toBeInTheDocument();
        expect(screen.queryByText('Rifacimento tetti')).not.toBeInTheDocument();
    });

    it('renders the text blocks of the company info, with bold, and no raw markers', () => {
        render(<About about={about} services={services.items} />);
        expect(screen.getByText('oltre 30 anni di esperienza').tagName).toBe('STRONG');
        expect(document.body.textContent).not.toContain('**');
    });

    it('asks for a quote in the chat, and says the site visit comes after it', () => {
        render(<About about={about} services={services.items} />);
        fireEvent.click(screen.getByRole('button', { name: about.cta_label }));
        expect(openChat).toHaveBeenCalledTimes(1);
        expect(screen.getByText(about.cta_note)).toBeInTheDocument();
    });

    it('has no phone link of its own: contacts come from the company info elsewhere', () => {
        const { container } = render(<About about={about} services={services.items} />);
        expect(container.querySelector('a[href^="tel:"]')).toBeNull();
        expect(within(container).queryByText(/sopralluogo gratuito/i, { selector: 'button' })).toBeNull();
    });

    it('shows no note under the button when the company info has none', () => {
        render(<About about={{ ...about, cta_note: '' }} services={services.items} />);
        expect(screen.queryByText(about.cta_note)).not.toBeInTheDocument();
    });

    it('uses semantic h1 -> h2 -> h3 heading hierarchy with no skipped heading levels', () => {
        const { container } = render(<About about={about} services={services.items} />);
        const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        const levels = headings.map((h) => Number(h.tagName.slice(1)));

        expect(levels[0]).toBe(1);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
        }

        expect(screen.getByRole('heading', { level: 2, name: about.philosophy_title })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: new RegExp(about.services_title) })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: about.why_title })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: about.excellences_title })).toBeInTheDocument();
    });

    it('links to completed projects and caps narrative blocks to readable line length', () => {
        const { container } = render(<About about={about} services={services.items} />);
        expect(screen.getByRole('link', { name: /progetti/i })).toHaveAttribute('href', '/progetti');
        const philosophyCard = container.querySelector('.card-powder');
        expect(philosophyCard).toHaveClass('overflow-clip');
        expect(philosophyCard).not.toHaveClass('overflow-hidden');
        expect(container.querySelectorAll('.max-w-\\[56ch\\]').length).toBeGreaterThanOrEqual(3);
    });
});
