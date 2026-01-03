'use client';

import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const testimonials = [
    {
        id: 1,
        name: 'Marco Rossi',
        role: 'Imprenditore',
        location: 'Milano',
        text: "Ero scettico sull'uso dell'IA per una ristrutturazione, ma il livello di dettaglio dei render preliminari mi ha sbalordito. Abbiamo risparmiato settimane di indecisioni scelte sui materiali.",
        rating: 5,
        initials: 'MR',
        gradient: 'from-blue-500 to-cyan-500'
    },
    {
        id: 2,
        name: 'Sofia Bianchi',
        role: 'Architetto',
        location: 'Roma',
        text: "Come professionista, apprezzo la precisione dei rilievi e la facilità di gestione del cantiere tramite la dashboard. Un partner tecnologico, non solo un'impresa.",
        rating: 5,
        initials: 'SB',
        gradient: 'from-purple-500 to-pink-500'
    },
    {
        id: 3,
        name: 'Luca e Giulia',
        role: 'Coppia',
        location: 'Firenze',
        text: "Volevamo ristrutturare il nostro primo appartamento senza stress. Il preventivo è stato rispettato al centesimo e la consegna è avvenuta in anticipo. Incredibile.",
        rating: 5,
        initials: 'LG',
        gradient: 'from-amber-500 to-orange-500'
    }
];

export function Testimonials() {
    return (
        <section id="testimonials" className="py-24 relative bg-slate-950 overflow-hidden">

            {/* Background Decor */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-600/20 rounded-full blur-[80px]" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-600/20 rounded-full blur-[80px]" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center justify-center p-3 mb-6 bg-slate-900/50 rounded-full border border-white/5"
                    >
                        <div className="flex gap-1 text-amber-400">
                            {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                        </div>
                        <span className="ml-3 text-sm text-slate-300 font-medium">Trusted by 500+ Homeowners</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-bold text-white mb-6"
                    >
                        Dicono di Noi
                    </motion.h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {testimonials.map((t, idx) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="relative p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-white/5 shadow-xl group hover:border-white/10 transition-colors"
                        >
                            <Quote className="absolute top-8 right-8 w-12 h-12 text-slate-800 group-hover:text-slate-700 transition-colors" />

                            <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-bold text-xl shadow-lg`}>
                                        {t.initials}
                                    </div>
                                    <div>
                                        <h4 className="text-white font-bold text-lg leading-tight">{t.name}</h4>
                                        <p className="text-slate-500 text-sm">{t.role} • {t.location}</p>
                                    </div>
                                </div>

                                <div className="flex gap-1 text-amber-500 mb-4">
                                    {[...Array(t.rating)].map((_, i) => (
                                        <Star key={i} className="w-4 h-4 fill-current" />
                                    ))}
                                </div>

                                <p className="text-slate-300 leading-relaxed italic">
                                    "{t.text}"
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
