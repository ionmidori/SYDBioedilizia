'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, PlayCircle, Star, ShieldCheck, Zap } from 'lucide-react';
import { SlideShowModal } from './SlideShowModal';

export function Hero() {
    // Track video loops
    const loopCountRef = useRef(0);
    const [isSlideShowOpen, setIsSlideShowOpen] = useState(false);

    return (
        <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
            {/* Background Elements */}
            <div className="absolute inset-0 bg-slate-950 z-0" />
            <div className="absolute inset-0 bg-[#020617] bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:40px_40px] opacity-20 z-0" />
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2" />

            <div className="container mx-auto px-4 md:px-6 relative z-10 grid lg:grid-cols-2 gap-12 items-center">

                {/* Text Content */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/30 border border-blue-500/30 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-6">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        La Nuova Era della Ristrutturazione
                    </div>

                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.3] mb-6 relative">
                        Realizza la <br />
                        <span className="relative z-20 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400">
                            Casa dei Sogni
                        </span>
                        <br /> con SYD BIOEDILIZIA.
                    </h1>

                    <p className="text-lg md:text-xl text-slate-400 mb-8 max-w-xl leading-relaxed">
                        Dall'idea alla realtà in pochi click. Ottieni preventivi istantanei, visualizzazioni 3D fotorealistiche e un team di esperti pronto a realizzare il tuo progetto.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 mb-12">
                        <Button
                            variant="premium"
                            size="lg"
                            className="h-14 px-8 text-base"
                            onClick={() => {
                                const event = new CustomEvent('OPEN_CHAT_WITH_MESSAGE', {
                                    detail: { message: "Vorrei richiedere un preventivo gratuito per la mia ristrutturazione." }
                                });
                                window.dispatchEvent(event);
                            }}
                        >
                            Richiedi Preventivo Gratuito
                            <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            className="h-14 px-8 text-base border-slate-700 hover:bg-slate-800 text-slate-300"
                            onClick={() => setIsSlideShowOpen(true)}
                        >
                            <PlayCircle className="mr-2 w-5 h-5" />
                            Guarda come funziona
                        </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-6 border-t border-white/5 pt-8">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-white">100+</h4>
                            <p className="text-sm text-slate-500">Progetti Completati</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-white">24h</h4>
                            <p className="text-sm text-slate-500">Tempo Preventivo</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h4 className="text-2xl font-bold text-white">4.9/5</h4>
                            <p className="text-sm text-slate-500">Soddisfazione Clienti</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="relative"
                >
                    {/* Abstract Light Glows - Minimalist */}
                    <div className="absolute -inset-4 bg-blue-500/10 rounded-full blur-[60px] -z-10" />


                    {/* Main Video Container - 'The Architect's Lens' */}
                    <div
                        className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-blue-900/30 group cursor-pointer"
                        onClick={() => {
                            const event = new CustomEvent('OPEN_CHAT_WITH_MESSAGE', {
                                detail: {}
                            });
                            window.dispatchEvent(event);
                        }}
                    >
                        <div className="relative aspect-video bg-slate-950">
                            <video
                                src="/videos/ai-interior-design.mp4"
                                autoPlay
                                muted
                                playsInline
                                onEnded={(e) => {
                                    // Play one more time (total 2 loops) then stop at last frame
                                    if (loopCountRef.current < 1) {
                                        e.currentTarget.play();
                                        loopCountRef.current++;
                                    }
                                }}
                                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                            />

                            {/* Inner Glow - Tech Vibe */}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-slate-950/10 pointer-events-none" />
                            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />

                            {/* Play overlay on hover */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-black/10 backdrop-blur-[1px]">
                                <div className="w-20 h-20 rounded-full bg-white/5 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-2xl">
                                    <Zap className="w-8 h-8 text-white fill-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Glow backing */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-20 -z-10" />

            <SlideShowModal isOpen={isSlideShowOpen} onClose={() => setIsSlideShowOpen(false)} />
        </section>
    );
}
