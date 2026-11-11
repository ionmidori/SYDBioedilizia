import { render, screen } from '@testing-library/react';
import { Navbar } from '@/components/sections/Navbar';

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
});

