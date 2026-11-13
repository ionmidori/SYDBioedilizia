import { Navbar } from '@/components/sections/Navbar';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { WhatWeDo } from '@/components/sections/WhatWeDo';
import { Testimonials } from '@/components/sections/Testimonials';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { Suspense } from 'react';
import { serializeJsonLd } from '@/lib/blog/seo';
import { getCompanyInfo } from '@/lib/company-info/server';
import { businessJsonLd } from '@/lib/company-info/structured-data';
import { getPortfolio } from '@/lib/portfolio/server';
import { portfolioShareImage } from '@/lib/portfolio/structured-data';
import { getTestimonials } from '@/lib/testimonials/server';
import { shareMetadata } from '@/lib/site-share';
import type { Metadata } from 'next';

/** Link preview with a real project photo (same cached fetch as the page). */
export async function generateMetadata(): Promise<Metadata> {
  const image = portfolioShareImage(await getPortfolio());
  return {
    alternates: { canonical: '/' },
    ...(image ? shareMetadata(image) : {}),
  };
}

export default async function Home() {
  // Rendered on the server (ISR, see lib/portfolio/server.ts): the real projects are
  // in the HTML, with no flash of the placeholder set while the browser fetches.
  const [portfolio, companyInfo, testimonials] = await Promise.all([
    getPortfolio(),
    getCompanyInfo(),
    getTestimonials(),
  ]);
  // GeneralContractor JSON-LD from the company info (contacts, area, hours, works).
  const jsonLd = businessJsonLd(companyInfo, { imageUrl: portfolioShareImage(portfolio)?.url });

  return (
    // overflow-x-clip, not -hidden: `hidden` makes this element a scroll container,
    // which silently disables `position: sticky` in the Services stack. `clip`
    // contains the decorative blur blobs without that side effect.
    <main className="min-h-screen bg-canvas text-ink overflow-x-clip selection:bg-primary/30">
      <script
        type="application/ld+json"
        // Company texts are edited in the admin console: `<` is escaped so none can close the script.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <Navbar />
      {/* Narrative header block: subtle Statuario marble texture runs across Hero & Services,
          fading out into pure canvas right before "Cosa facciamo" (WhatWeDo). */}
      <div className="relative">
        <div className="hero-services-marble" aria-hidden="true" />
        <Hero portfolio={portfolio} />
        <Services items={companyInfo.home_services} />
      </div>
      <WhatWeDo />
      <Testimonials initial={testimonials} />
      <Footer />
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
    </main>
  );
}
