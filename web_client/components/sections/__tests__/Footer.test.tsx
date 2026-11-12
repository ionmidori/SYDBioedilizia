import { render, screen } from '@testing-library/react';
import { Footer } from '@/components/sections/Footer';
import { VCARD_PATH } from '@/lib/company-info/vcard';
import { renderWithCompany, TEST_IDENTITY } from '@/test-utils/company';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Footer', () => {
    it('is the night-blue inverse surface', () => {
        renderWithCompany(<Footer />);
        expect(screen.getByRole('contentinfo')).toHaveClass('surface-inverse');
    });

    it('lets the logo take its tone from the surface, with no tone class of its own', () => {
        renderWithCompany(<Footer />);
        const logo = screen.getByRole('img', { name: 'SYD Bioedilizia' });
        expect(logo.getAttribute('class')).not.toMatch(/brand-tone-/);
    });

    it('heads its link groups with h2, a level any page outline can reach without skipping', () => {
        renderWithCompany(<Footer />);
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Esplora', 'Contatti']);
    });

    it('shows the contacts of the company info, never fixed ones', () => {
        renderWithCompany(<Footer />);
        expect(screen.getByRole('link', { name: TEST_IDENTITY.phone })).toHaveAttribute('href', 'tel:+39061234567');
        // The address wraps at "@" (<wbr>), so its accessible name is split: find it by href.
        const mail = screen.getAllByRole('link').find((a) => a.getAttribute('href') === 'mailto:info@esempio.it');
        expect(mail).toHaveTextContent('info@esempio.it');
        expect(screen.getByText(`P.IVA: ${TEST_IDENTITY.vat_id}`)).toBeInTheDocument();
        expect(screen.getByText(/Via Quero, 132/)).toBeInTheDocument();
    });

    it('hides the contact column when there is no company info, and keeps the rest', () => {
        render(<Footer />);
        expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Esplora']);
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('offers the contact file of the company info for download', () => {
        renderWithCompany(<Footer />);
        const save = screen.getByRole('link', { name: 'Salva il contatto di SYD' });
        expect(save).toHaveAttribute('href', VCARD_PATH);
        expect(save).toHaveAttribute('download');
    });
});
