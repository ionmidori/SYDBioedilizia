import type { SVGProps } from 'react';
import { BRAND_NAME, LOGO_ART, LOGO_PARTS, logoToneClass, type LogoTone, type LogoVariant } from '@/lib/brand';
import { cn } from '@/lib/utils';

export interface BrandLogoProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'role' | 'children'> {
    /** `horizontal` (navbar), `full` (stacked: footer, documents), `mark` (SYD), `icon` (leaf + S). */
    variant?: LogoVariant;
    /** Colours for the surface behind the logo: `on-dark` lifts the dark facets. */
    tone?: LogoTone;
    /** Accessible name. */
    title?: string;
    /** Hide from assistive tech when the brand name is already announced nearby. */
    decorative?: boolean;
}

/**
 * The SYD Bioedilizia logo as inline SVG. Shapes come from the generated
 * artwork and are filled with the logo role variables (app/brand-tokens.css):
 * the component holds no colour. Size it by height, e.g. `className="h-10"`.
 * No hooks and no client APIs: it renders in Server and Client Components.
 */
export function BrandLogo({
    variant = 'horizontal',
    tone = 'default',
    title = BRAND_NAME,
    decorative = false,
    className,
    ...svgProps
}: BrandLogoProps) {
    const { viewBox, layers } = LOGO_ART[variant];
    const [minX, minY, width, height] = viewBox;
    const a11y = decorative
        ? ({ 'aria-hidden': true, focusable: 'false' } as const)
        : ({ role: 'img', 'aria-label': title } as const);

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`${minX} ${minY} ${width} ${height}`}
            width={width}
            height={height}
            data-variant={variant}
            className={cn('h-10 w-auto shrink-0', logoToneClass(tone), className)}
            {...a11y}
            {...svgProps}
        >
            {decorative ? null : <title>{title}</title>}
            {layers.map(({ part, transform }) => (
                <g
                    key={part}
                    data-part={part}
                    transform={transform ? `matrix(${transform[0]} 0 0 ${transform[0]} ${transform[1]} ${transform[2]})` : undefined}
                >
                    {LOGO_PARTS[part].map((p, i) => (
                        <path key={i} d={p.d} style={{ fill: `var(--logo-${p.role})` }} />
                    ))}
                </g>
            ))}
        </svg>
    );
}
