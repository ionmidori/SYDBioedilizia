import { render, screen } from '@testing-library/react';
import { Services } from '@/components/sections/Services';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: null }),
}));

jest.mock('@/components/auth/AuthDialog', () => ({
    AuthDialog: () => null,
}));

// framer-motion reads `(prefers-reduced-motion)` once per module registry and
// caches it, so this lives in its own file with the preference set up front.
beforeAll(() => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') && !query.includes('no-preference'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
});

describe('Services — reduced motion', () => {
    it('renders the header in place instead of fading it in', () => {
        render(<Services />);

        expect(screen.getByRole('heading', { level: 2 }).style.opacity).not.toBe('0');
        expect(screen.getByText(/reingegnerizzato il processo/i).style.opacity).not.toBe('0');
    });
});
