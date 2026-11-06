/**
 * Link-preview metadata (OpenGraph / Twitter) shared by the root layout and the
 * homepage. The default image is the brand logo — never a stock photo, which a
 * preview would present as our work. The homepage replaces it with the photo of
 * its first real portfolio project (`portfolioShareImage`).
 */
import type { Metadata } from 'next';
import { BRAND_NAME, DEFAULT_OG_IMAGE } from '@/lib/brand';

const TITLE = 'SYD BIOEDILIZIA - Ristrutturazioni e Bioedilizia a Roma';
const DESCRIPTION = 'Eccellenza nelle ristrutturazioni tradizionali e bioedilizia a Roma e provincia.';

export interface ShareImage {
    url: string;
    alt: string;
    width?: number;
    height?: number;
}

export const DEFAULT_SHARE_IMAGE: ShareImage = {
    url: DEFAULT_OG_IMAGE.url,
    alt: BRAND_NAME,
    width: DEFAULT_OG_IMAGE.width,
    height: DEFAULT_OG_IMAGE.height,
};

export function shareMetadata(image: ShareImage = DEFAULT_SHARE_IMAGE): Pick<Metadata, 'openGraph' | 'twitter'> {
    return {
        openGraph: {
            title: TITLE,
            description: DESCRIPTION,
            url: 'https://sydbioedilizia.vercel.app',
            siteName: 'SYD BIOEDILIZIA',
            locale: 'it_IT',
            type: 'website',
            images: [image],
        },
        twitter: {
            card: 'summary_large_image',
            title: TITLE,
            description: DESCRIPTION,
            images: [image.url],
        },
    };
}
