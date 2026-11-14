import { act, fireEvent, render, screen } from '@testing-library/react';
import { FAQItemCard } from '@/components/faq/FAQItem';
import { openChat } from '@/lib/chat-events';
import type { FaqItem } from '@/types/company-info';

jest.mock('@/lib/chat-events', () => ({
    openChat: jest.fn(),
}));

const sampleItem: FaqItem = {
    slug: 'costo-mq',
    question: 'Quanto costa ristrutturare al mq?',
    category: 'Costi & Tempi',
    answer: [{ type: 'lead', text: 'Prezzo da **800€** al mq.' }],
};

describe('FAQItemCard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.history.replaceState(null, '', '/faq');
    });

    it('opens automatically when the URL hash matches its slug and handles hashchange', () => {
        window.history.replaceState(null, '', '/faq#costo-mq');
        render(<FAQItemCard item={sampleItem} />);

        const trigger = screen.getByRole('button', { name: sampleItem.question });
        expect(trigger).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        act(() => {
            window.history.replaceState(null, '', '/faq#altro');
            window.dispatchEvent(new HashChangeEvent('hashchange'));
            window.history.replaceState(null, '', '/faq#costo-mq');
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('respects forceOpen and notifies onToggle on manual clicks', () => {
        const onToggle = jest.fn();
        const { rerender } = render(<FAQItemCard item={sampleItem} forceOpen={true} onToggle={onToggle} />);

        const trigger = screen.getByRole('button', { name: sampleItem.question });
        expect(trigger).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(onToggle).toHaveBeenCalledWith('costo-mq', false);

        rerender(<FAQItemCard item={sampleItem} forceOpen={false} onToggle={onToggle} />);
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('uses opaque surface styling without backdrop-blur', () => {
        const { container } = render(<FAQItemCard item={sampleItem} />);
        const card = container.firstElementChild as HTMLElement;
        expect(card.className).not.toMatch(/backdrop-blur/);
        expect(card.className).toContain('bg-surface');
    });

    it('copies the anchored FAQ URL and lets visitors ask SYD with prefilled question', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        render(<FAQItemCard item={sampleItem} forceOpen={true} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Copia link/i }));
        });
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#costo-mq'));
        expect(screen.getByText(/Link copiato/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Chiedi a SYD su questa domanda/i }));
        expect(openChat).toHaveBeenCalledWith(expect.stringContaining(sampleItem.question));
    });
});
