'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { M3Spring } from '@/lib/m3-motion';
import { Button } from '@/components/ui/button';
import { PlayCircle, Zap, Palette, FileText } from 'lucide-react';
import { SlideShowModal } from './SlideShowModal';

/**
 * Internal Hero Video Component
 * Handles auto-restart on mobile when entering viewport
 */
function HeroVideo({ className = '', isMobile = false }: { className?: string; isMobile?: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const loopCountRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inView = useInView(containerRef, { margin: "-20% 0px -20% 0px" });

    // Auto-restart video when entering viewport on mobile
    useEffect(() => {
        if (isMobile && inView && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {
                // Autoplay might be blocked, ignore
            });
        }
    }, [isMobile, inView]);

    return (
        <div
            ref={containerRef}
            className={`relative rounded-2xl overflow-hidden border-2 border-luxury-gold shadow-[0_0_40px_rgba(42,157,143,0.3)] group cursor-pointer bg-slate-950 ${className}`}
            onClick={() => {
                const event = new CustomEvent('OPEN_CHAT_WITH_MESSAGE', {
                    detail: {}
                });
                window.dispatchEvent(event);
            }}
        >
            <div className="aspect-[4/3] md:aspect-video relative">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    crossOrigin="anonymous"
                    onEnded={(e) => {
                        if (loopCountRef.current < 1) {
                            e.currentTarget.play();
                            loopCountRef.current++;
                        }
                    }}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 opacity-90 group-hover:opacity-100"
                >
                    <source src="/videos/ai-interior-design.mp4" type="video/mp4" />
                </video>

                <div className="absolute inset-0 bg-gradient-to-t from-luxury-bg/40 via-transparent to-transparent pointer-events-none" />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-luxury-bg/20 backdrop-blur-[2px]">
                    <div className="w-20 h-20 rounded-full bg-luxury-teal/20 backdrop-blur-xl flex items-center justify-center border border-luxury-teal/50 shadow-2xl">
                        <Zap className="w-8 h-8 text-luxury-text fill-luxury-text drop-shadow-[0_0_10px_rgba(42,157,143,0.8)]" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function Hero() {
    const [isSlideShowOpen, setIsSlideShowOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Mobile detection
    useEffect(() => {
        // Run only once on mount to avoid cascading renders
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        
        // Wrap in timeout to avoid sync setState warning in effect body
        const timerId = setTimeout(handleResize, 0);
        
        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(timerId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <section className="relative min-h-[100dvh] flex items-center pt-20 overflow-hidden bg-luxury-bg">
            {/* Background Elements - Luxury Tech */}
            <div className="absolute inset-0 bg-luxury-bg z-0" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-luxury-teal/10 rounded-full atmospheric-blur-optimized -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-luxury-gold/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10 grid lg:grid-cols-2 gap-12 items-center lg:items-start">

                {/* Text Content */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={M3Spring.gentle}
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-luxury-bg border border-luxury-gold/30 text-white text-xs font-semibold uppercase tracking-wider mb-8 shadow-sm shadow-luxury-gold/10">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-luxury-gold opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-luxury-gold"></span>
                        </span>
                        La Nuova Era della Ristrutturazione
                    </div>

                    {/* Headline */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-luxury-text leading-[1.2] mb-6">
                        Realizza la <br />
                        <span className="text-luxury-gold italic relative">
                            Casa dei Sogni
                            <span className="absolute -bottom-2 left-0 w-full h-1 bg-luxury-teal/30 rounded-full blur-sm"></span>
                        </span>
                        <br /> con <span className="font-trajan tracking-tight">SYD BIOEDILIZIA</span>
                    </h1>

                    <p className="text-lg md:text-xl text-luxury-text/80 mb-10 max-w-xl leading-relaxed font-light">
                        Dall&apos;idea alla realtà in pochi click. Ottieni preventivi istantanei, visualizzazioni 3D fotorealistiche e un team di esperti pronto a realizzare il tuo progetto.
                    </p>

                    {/* Mobile Video - Between Text and Buttons */}
                    <div className="md:hidden mb-8">
                        <HeroVideo isMobile={isMobile} />
                    </div>

                    <div className="flex flex-col gap-6 mb-12">
                        {/* Primary CTA - Quote */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-lg shadow-lg shadow-luxury-teal/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 active:shadow-none"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT');
                                    window.dispatchEvent(event);
                                }}
                            >
                                Richiedi Preventivo Gratuito
                                <FileText className="ml-2 w-5 h-5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold/10 hover:border-luxury-gold rounded-lg transition-all duration-200 active:scale-95 active:bg-luxury-gold/20"
                                onClick={() => setIsSlideShowOpen(true)}
                            >
                                <PlayCircle className="mr-2 w-5 h-5" />
                                Guarda come funziona
                            </Button>
                        </div>

                        {/* Secondary CTA - Rendering */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-lg shadow-lg shadow-luxury-teal/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 active:shadow-none"
                                onClick={() => {
                                    const event = new CustomEvent('OPEN_CHAT');
                                    window.dispatchEvent(event);
                                }}
                            >
                                Crea Rendering Gratuito
                                <Palette className="ml-2 w-5 h-5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                className="h-14 px-8 text-base min-w-[300px] border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold/10 hover:border-luxury-gold rounded-lg transition-all duration-200 active:scale-95 active:bg-luxury-gold/20"
                                onClick={() => setIsSlideShowOpen(true)}
                            >
                                <PlayCircle className="mr-2 w-5 h-5" />
                                Guarda come funziona
                            </Button>
                        </div>
                    </div>

                    {/* Stats - Luxury Style */}
                    <div className="grid grid-cols-3 gap-6 border-t border-luxury-gold/20 pt-8">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-luxury-text">100+</h4>
                            <p className="text-sm text-luxury-text/60">Progetti Completati</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-luxury-text">24h</h4>
                            <p className="text-sm text-luxury-text/60">Tempo Preventivo</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-luxury-text">4.9/5</h4>
                            <p className="text-sm text-luxury-text/60">Soddisfazione Clienti</p>
                        </div>
                    </div>
                </motion.div>

                {/* Desktop Video - Right Column */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, ...M3Spring.standard }}
                    className="relative hidden md:block lg:mt-20"
                >
                    <HeroVideo />
                </motion.div>
            </div>

            {/* Modal */}
            <SlideShowModal isOpen={isSlideShowOpen} onClose={() => setIsSlideShowOpen(false)} />
        </section>
    );
}
