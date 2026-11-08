import { Navbar } from '@/components/sections/Navbar';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { WhatWeDo } from '@/components/sections/WhatWeDo';
import { Testimonials } from '@/components/sections/Testimonials';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { Suspense } from 'react';
import { COMPANY } from '@/lib/company';
import { STRUCTURED_DATA_LOGO } from '@/lib/brand';
import { getPortfolio } from '@/lib/portfolio/server';
import { portfolioShareImage } from '@/lib/portfolio/structured-data';
import { shareMetadata } from '@/lib/site-share';
import type { Metadata } from 'next';

/** Link preview with a real project photo (same cached fetch as the page). */
export async function generateMetadata(): Promise<Metadata> {
  const image = portfolioShareImage(await getPortfolio());
  return image ? shareMetadata(image) : {};
}

export default async function Home() {
  // Rendered on the server (ISR, see lib/portfolio/server.ts): the real projects are
  // in the HTML, with no flash of the placeholder set while the browser fetches.
  const portfolio = await getPortfolio();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GeneralContractor",
    "@id": `${COMPANY.url}/#business`,
    "name": "SYD BIOEDILIZIA",
    "legalName": COMPANY.legalName,
    "description": "Leader a Roma e Provincia: ristrutturazioni tradizionali e bioedilizia.",
    "url": COMPANY.url,
    "logo": `${COMPANY.url}${STRUCTURED_DATA_LOGO.url}`,
    "image": `${COMPANY.url}${STRUCTURED_DATA_LOGO.url}`,
    "telephone": COMPANY.phone,
    "email": COMPANY.email,
    "vatID": `IT${COMPANY.vatId}`,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": COMPANY.address.street,
      "postalCode": COMPANY.address.postalCode,
      "addressLocality": COMPANY.address.city,
      "addressRegion": COMPANY.address.region,
      "addressCountry": COMPANY.address.country
    },
    "areaServed": [
      { "@type": "City", "name": "Roma" },
      { "@type": "City", "name": "Fiumicino" },
      { "@type": "City", "name": "Pomezia" },
      { "@type": "City", "name": "Tivoli" },
      { "@type": "City", "name": "Albano Laziale" },
      { "@type": "City", "name": "Cerveteri" },
      { "@type": "City", "name": "Bracciano" },
      { "@type": "City", "name": "Ciampino" },
      { "@type": "City", "name": "Ladispoli" },
      { "@type": "City", "name": "Frascati" },
      { "@type": "City", "name": "Acilia" },
      { "@type": "AdministrativeArea", "name": "Provincia di Roma" }
    ],
    "knowsAbout": [
      "Ristrutturazioni Tradizionali",
      "Bioedilizia",
      "Design d'Interni",
      "Efficientamento Energetico",
      "Rifacimento Bagni",
      "Ristrutturazione Completa Appartamenti",
      "Sostituzione Infissi",
      "Installazione Climatizzatori",
      "Rifacimento Impianti Elettrici",
      "Posa Piastrelle"
    ],
    "priceRange": "€€€"
  };

  return (
    // overflow-x-clip, not -hidden: `hidden` makes this element a scroll container,
    // which silently disables `position: sticky` in the Services stack. `clip`
    // contains the decorative blur blobs without that side effect.
    <main className="min-h-screen bg-canvas text-ink overflow-x-clip selection:bg-primary/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <Hero portfolio={portfolio} />
      <Services />
      <WhatWeDo />
      <Testimonials />
      <Footer />
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
    </main>
  );
}
