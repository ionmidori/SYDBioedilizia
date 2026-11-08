import { render, screen } from '@testing-library/react';
import { Footer } from '@/components/sections/Footer';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Footer', () => {
    it('is the night-blue inverse surface', () => {
        render(<Footer />);
        expect(screen.getByRole('contentinfo')).toHaveClass('surface-inverse');
    });

    it('lets the logo take its tone from the surface, with no tone class of its own', () => {
        render(<Footer />);
        const logo = screen.getByRole('img', { name: 'SYD Bioedilizia' });
        expect(logo.getAttribute('class')).not.toMatch(/brand-tone-/);
    });

    it('heads its link groups with h2, a level any page outline can reach without skipping', () => {
        render(<Footer />);
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Esplora', 'Contatti']);
    });
});
