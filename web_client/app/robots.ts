import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://sybioedilizia.vercel.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/auth/', '/maintenance/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
