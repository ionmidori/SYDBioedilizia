import { fireEvent, render, screen } from '@testing-library/react';
import { Navbar } from '@/components/sections/Navbar';
import { renderWithCompany, TEST_IDENTITY } from '@/test-utils/company';

let mockPathname = '/';

jest.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: null, isAnonymous: true }),
}));

jest.mock('@/components/auth/SignInButton', () => ({
    SignInButton: () => null,
}));

describe('Navbar', () => {
    it.each(['/', '/blog', '/progetti'])(
        'links "Progetti" to the archive page from %s',
        (pathname) => {
            mockPathname = pathname;

            render(<Navbar />);

            const links = screen.getAllByRole('link', { name: 'Progetti' });
            expect(links.length).toBeGreaterThan(0);
            links.forEach((link) => expect(link).toHaveAttribute('href', '/progetti'));
        },
    );

    describe('contact menu', () => {
        const openMenu = () => fireEvent.click(screen.getAllByRole('button', { name: 'Contatti' })[0]);

        it('uses the contacts of the company info', () => {
            renderWithCompany(<Navbar />);
            openMenu();
            expect(screen.getByRole('link', { name: 'Chiama' })).toHaveAttribute('href', 'tel:+39061234567');
            expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:info@esempio.it');
            expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/393331112223');
        });

        it('has no WhatsApp link when the company info has no WhatsApp number', () => {
            renderWithCompany(<Navbar />, { ...TEST_IDENTITY, whatsapp: null });
            openMenu();
            expect(screen.getByRole('link', { name: 'Chiama' })).toBeInTheDocument();
            expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
        });

        it('has no contact links, and still renders, without company info', () => {
            render(<Navbar />);
            openMenu();
            expect(screen.queryByRole('link', { name: 'Chiama' })).not.toBeInTheDocument();
            expect(screen.getAllByRole('link', { name: 'Progetti' }).length).toBeGreaterThan(0);
        });
    });

    it('does not animate or mutate vertical padding on scroll (prevents scroll-start layout thrashing)', () => {
        Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
        const { container } = render(<Navbar />);
        const nav = container.querySelector('nav');
        expect(nav).not.toBeNull();
        const initialClasses = nav!.className;

        expect(initialClasses).not.toMatch(/transition-\[[^\]]*padding[^\]]*\]/);

        Object.defineProperty(window, 'scrollY', { value: 120, writable: true, configurable: true });
        fireEvent.scroll(window);

        const scrolledClasses = nav!.className;
        expect(scrolledClasses).toContain('bg-canvas/80');
        // Vertical padding stays constant across unscrolled/scrolled states
        const initialPy = initialClasses.match(/\bpy-\d+\b/)?.[0];
        const scrolledPy = scrolledClasses.match(/\bpy-\d+\b/)?.[0];
        expect(scrolledPy).toBe(initialPy);
    });

    it('keeps desktop nav labels aligned with the DESIGN.md 12px ramp (text-xs)', () => {
        const { container } = render(<Navbar />);
        expect(container.innerHTML).not.toContain('text-[11px]');
    });
});
