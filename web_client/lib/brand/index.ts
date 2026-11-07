/**
 * The SYD Bioedilizia brand, for application code: name, logo artwork, colours
 * and the public logo files. Everything visual here is GENERATED from
 * `web_client/brand/` (tokens + master logo) by `npm run brand:build`, so no
 * colour, size or file path is written by hand anywhere else.
 */
import type { Metadata, MetadataRoute } from 'next';
import identity from '../../brand/brand.json';
import { BRAND_ASSETS } from './assets.generated';
import { LOGO_TONE_CLASS, themeRoles, type LogoTone } from './tokens.generated';

export { BRAND_ASSETS } from './assets.generated';
export { LOGO_ART, LOGO_PARTS, LOGO_VARIANTS, type LogoArt, type LogoPart, type LogoVariant } from './logo-art.generated';
export {
    LOGO_ROLES,
    LOGO_TONES,
    ROLE_NAMES,
    SURFACES,
    TEXT_ROLES,
    brandColors,
    logoColors,
    themeRoles,
    type LogoRole,
    type LogoTone,
    type Role,
    type Surface,
    type TextRole,
} from './tokens.generated';

/** Identity: web_client/brand/brand.json (also read by the asset build, e.g. the SVG <title>). */
export const BRAND_NAME: string = identity.name;
export const BRAND_SHORT_NAME: string = identity.shortName;
export const BRAND_DESCRIPTION: string = identity.description;

/** Browser chrome and PWA splash: the page background of the active theme. */
export const THEME_COLOR: string = themeRoles.default.canvas;

/** Class that applies a logo tone, or undefined for the default one. */
export function logoToneClass(tone: LogoTone): string | undefined {
    return tone === 'default' ? undefined : LOGO_TONE_CLASS[tone];
}

const px = (a: { width: number; height: number }) => `${a.width}x${a.height}`;

/**
 * <link rel="icon"> set (Evil Martians, "How to Favicon in 2026"): the ICO is
 * declared 32x32, not `any`, otherwise Chrome prefers it over the SVG; the SVG
 * switches to its dark tone under prefers-color-scheme: dark.
 */
export const BRAND_ICONS: NonNullable<Metadata['icons']> = {
    icon: [
        { url: BRAND_ASSETS.favicon.url, sizes: '32x32' },
        { url: BRAND_ASSETS.iconSvg.url, type: BRAND_ASSETS.iconSvg.type },
    ],
    apple: [{ url: BRAND_ASSETS.appleTouchIcon.url, sizes: px(BRAND_ASSETS.appleTouchIcon) }],
};

export const MANIFEST_ICONS: NonNullable<MetadataRoute.Manifest['icons']> = [
    BRAND_ASSETS.pwa192,
    BRAND_ASSETS.pwa512,
    BRAND_ASSETS.maskable512,
].map((a) => ({
    src: a.url,
    sizes: px(a),
    type: a.type,
    purpose: 'purpose' in a ? a.purpose : 'any',
}));

/** Organization / publisher logo for JSON-LD (Google: raster, >= 112 px). */
export const STRUCTURED_DATA_LOGO = BRAND_ASSETS.logoPng;

/** Default link-preview image. */
export const DEFAULT_OG_IMAGE = BRAND_ASSETS.ogDefault;

/** Logo URLs used before the brand system: kept alive as permanent redirects. */
export const LEGACY_LOGO_REDIRECTS: readonly { source: string; destination: string }[] = [
    { source: '/syd-logo.png', destination: BRAND_ASSETS.logoPng.url },
    { source: '/syd-logo.svg', destination: BRAND_ASSETS.logoSvg.url },
    { source: '/syd-icon.svg', destination: BRAND_ASSETS.iconSvg.url },
    { source: '/icon-192.png', destination: BRAND_ASSETS.pwa192.url },
    { source: '/icon-512.png', destination: BRAND_ASSETS.pwa512.url },
    { source: '/icon-maskable-512.png', destination: BRAND_ASSETS.maskable512.url },
    { source: '/manifest.json', destination: '/manifest.webmanifest' },
];
