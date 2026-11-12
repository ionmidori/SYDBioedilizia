import { Suspense } from 'react';
import { Navbar } from '@/components/sections/Navbar';
import { About } from '@/components/sections/About';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { getCompanyInfo } from '@/lib/company-info/server';

export default async function ChiSiamoPage() {
    // Texts and works come from the company info edited in the admin console.
    const { about, services } = await getCompanyInfo();
    return (
        <main className="min-h-screen bg-canvas text-ink overflow-x-hidden selection:bg-primary/30">
            <Navbar />
            {/* Spacer for fixed navbar */}
            <div className="pt-20">
                <About about={about} services={services.items} />
            </div>
            <Footer />
            <Suspense fallback={<div />}>
                <ChatWidget />
            </Suspense>
        </main>
    );
}
