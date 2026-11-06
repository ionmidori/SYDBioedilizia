import type { MetadataRoute } from 'next';
import { BRAND_NAME, BRAND_SHORT_NAME, MANIFEST_ICONS, THEME_COLOR } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: BRAND_NAME,
        short_name: BRAND_SHORT_NAME,
        description: 'Ristrutturazioni e bioedilizia a Roma e provincia.',
        start_url: '/',
        display: 'standalone',
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
        orientation: 'portrait',
        icons: MANIFEST_ICONS,
    };
}
