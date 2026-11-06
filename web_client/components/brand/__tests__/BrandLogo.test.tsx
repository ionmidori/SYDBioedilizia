import { render, screen } from '@testing-library/react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { LOGO_ART, LOGO_PARTS, LOGO_VARIANTS } from '@/lib/brand';

describe('BrandLogo', () => {
    it('is an image named after the brand', () => {
        render(<BrandLogo />);
        expect(screen.getByRole('img', { name: 'SYD Bioedilizia' })).toBeInTheDocument();
    });

    it('accepts a custom accessible name', () => {
        render(<BrandLogo title="SYD Bioedilizia — home" />);
        expect(screen.getByRole('img', { name: 'SYD Bioedilizia — home' })).toBeInTheDocument();
    });

    it('can be hidden from assistive tech when the name is announced elsewhere', () => {
        const { container } = render(<BrandLogo decorative />);
        const svg = container.querySelector('svg')!;
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg.querySelector('title')).toBeNull();
        expect(screen.queryByRole('img')).toBeNull();
    });

    it.each(LOGO_VARIANTS)('renders the %s artwork with its intrinsic aspect ratio', (variant) => {
        const { container } = render(<BrandLogo variant={variant} />);
        const svg = container.querySelector('svg')!;
        const [x, y, w, h] = LOGO_ART[variant].viewBox;
        expect(svg).toHaveAttribute('viewBox', `${x} ${y} ${w} ${h}`);
        expect(svg).toHaveAttribute('width', String(w));
        expect(svg).toHaveAttribute('height', String(h));
        const layers = LOGO_ART[variant].layers;
        expect(Array.from(svg.querySelectorAll('g')).map((g) => g.getAttribute('data-part'))).toEqual(layers.map((l) => l.part));
        expect(svg.querySelectorAll('path')).toHaveLength(layers.reduce((n, l) => n + LOGO_PARTS[l.part].length, 0));
    });

    it('fills shapes with the logo role variables, never with a colour', () => {
        const { container } = render(<BrandLogo variant="full" />);
        for (const p of Array.from(container.querySelectorAll('path'))) {
            expect(p.getAttribute('fill')).toBeNull();
            expect(p.style.fill).toMatch(/^var\(--logo-[a-z0-9-]+\)$/);
        }
    });

    it('scales the wordmark beside the symbol in the horizontal lockup', () => {
        const { container } = render(<BrandLogo variant="horizontal" />);
        const [k, tx, ty] = LOGO_ART.horizontal.layers.find((l) => l.part === 'wordmark')!.transform!;
        expect(container.querySelector('g[data-part="wordmark"]')).toHaveAttribute('transform', `matrix(${k} 0 0 ${k} ${tx} ${ty})`);
        expect(container.querySelector('g[data-part="icon"]')).not.toHaveAttribute('transform');
    });

    it('applies the tone class for dark surfaces only when asked', () => {
        const { container, rerender } = render(<BrandLogo />);
        expect(container.querySelector('svg')!.getAttribute('class')).not.toMatch(/brand-tone-/);
        rerender(<BrandLogo tone="on-dark" />);
        expect(container.querySelector('svg')).toHaveClass('brand-tone-on-dark');
    });

    it('lets the caller size it, overriding the default height', () => {
        const { container } = render(<BrandLogo className="h-8" />);
        const svg = container.querySelector('svg')!;
        expect(svg).toHaveClass('h-8');
        expect(svg).not.toHaveClass('h-10');
    });
});
