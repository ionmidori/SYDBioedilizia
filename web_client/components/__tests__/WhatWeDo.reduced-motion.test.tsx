import { render, screen } from '@testing-library/react';
import { WhatWeDo } from '@/components/sections/WhatWeDo';

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

describe('WhatWeDo — reduced motion', () => {
    it('renders the header in place instead of fading it in', () => {
        render(<WhatWeDo />);

        expect(screen.getByRole('heading', { level: 2 }).style.opacity).not.toBe('0');
        expect(screen.getByText(/dalla singola lavorazione/i).style.opacity).not.toBe('0');
    });
});
