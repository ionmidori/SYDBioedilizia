import { Navbar } from '@/components/sections/Navbar';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Portfolio } from '@/components/sections/Portfolio';
import { Testimonials } from '@/components/sections/Testimonials';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { Suspense } from 'react';

export default function Home() {
  return (
    <main className="min-h-screen bg-luxury-bg text-luxury-text overflow-x-hidden selection:bg-luxury-teal/30">
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
