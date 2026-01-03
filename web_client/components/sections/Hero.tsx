'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, PlayCircle, Star, ShieldCheck, Zap } from 'lucide-react';

export function Hero() {
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

                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1] mb-6">
                        Progetta la <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400">
                            Casa dei Sogni
                        </span>
                        <br /> con l'AI.
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
                        <Button variant="outline" size="lg" className="h-14 px-8 text-base border-slate-700 hover:bg-slate-800 text-slate-300">
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

                {/* Visual Content - Dashboard Preview */}
                <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="relative"
                >
                    <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/50 shadow-2xl shadow-blue-900/20 backdrop-blur-sm group">
                        {/* Fake UI Header */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                            <div className="w-3 h-3 rounded-full bg-red-500/50" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                            <div className="w-3 h-3 rounded-full bg-green-500/50" />
                            <div className="ml-4 w-60 h-6 rounded-full bg-slate-800/50" />
                        </div>

                        {/* Content Area - Clickable to trigger rendering */}
                        <div
                            className="p-1 min-h-[400px] relative bg-slate-950 cursor-pointer transition-all hover:ring-2 hover:ring-blue-500/50"
                            onClick={() => {
                                const event = new CustomEvent('OPEN_CHAT_WITH_MESSAGE', {
                                    detail: { message: "Vorrei vedere un rendering 3D della mia idea." }
                                });
                                window.dispatchEvent(event);
                            }}
                            title="Clicca per iniziare la visualizzazione AI"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-20 h-20 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                                        <Zap className="w-10 h-10 text-blue-400" />
                                    </div>
                                    <p className="text-slate-500 font-mono text-sm">AI Visualization Engine</p>
                                    <p className="text-slate-600 text-xs mt-2">Clicca per generare...</p>
                                </div>
                            </div>

                            {/* Floating Badges */}
                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                className="absolute top-10 right-10 p-4 bg-slate-900/90 border border-slate-700/50 rounded-xl shadow-xl backdrop-blur-md"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400">Preventivo Garantito</p>
                                        <p className="text-sm font-bold text-white">€1.200 di risparmio</p>
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div
                                animate={{ y: [0, 10, 0] }}
                                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
                                className="absolute bottom-10 left-10 p-4 bg-slate-900/90 border border-slate-700/50 rounded-xl shadow-xl backdrop-blur-md"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                                        <Star className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400">Design Score</p>
                                        <p className="text-sm font-bold text-white">98/100 Excellent</p>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* Glow backing */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-20 -z-10" />
                </motion.div>
            </div>
        </section>
    );
}
