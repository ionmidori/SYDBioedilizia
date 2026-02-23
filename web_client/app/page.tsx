import { Navbar } from '@/components/sections/Navbar';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Portfolio } from '@/components/sections/Portfolio';
import { Testimonials } from '@/components/sections/Testimonials';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { Suspense } from 'react';

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GeneralContractor",
    "name": "SYD BIOEDILIZIA",
    "description": "Leader a Roma e Provincia: ristrutturazioni tradizionali e bioedilizia.",
    "url": "https://sydbioedilizia.vercel.app",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Roma",
      "addressRegion": "RM",
      "addressCountry": "IT"
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
      "Efficientamento Energetico"
    ],
    "priceRange": "€€€"
  };

  return (
    <main className="min-h-screen bg-luxury-bg text-luxury-text overflow-x-hidden selection:bg-luxury-teal/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <Hero />
      <Services />
      <Portfolio />
      <Testimonials />
      <Footer />
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
    </main>
  );
}
