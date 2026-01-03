'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// Placeholder content - In production these would be your generated AI renders
const projects = [
    {
        id: 1,
        title: 'Villa Moderna',
        category: 'Soggiorno',
        location: 'Milano, City Life',
        image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1974&auto=format&fit=crop',
        description: 'Ristrutturazione completa di un penthous con vista panoramica. Stile minimalista con tocchi caldi in legno.',
        stats: { area: '120 mq', duration: '3 mesi', budget: '€85k' }
    },
    {
        id: 2,
        title: 'Cucina Minimal',
        category: 'Cucina',
        location: 'Roma, Parioli',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=2070&auto=format&fit=crop',
        description: 'Design open space con isola centrale in marmo Calacatta e illuminazione LED integrata.',
        stats: { area: '45 mq', duration: '4 settimane', budget: '€32k' }
    },
    {
        id: 3,
        title: 'Luxury Spa',
        category: 'Bagno',
        location: 'Firenze, Centro',
        image: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?q=80&w=1974&auto=format&fit=crop',
        description: 'Trasformazione di un bagno padronale in una spa privata con vasca freestanding e finiture in pietra.',
        stats: { area: '18 mq', duration: '3 settimane', budget: '€22k' }
    },
    {
        id: 4,
        title: 'Loft Industriale',
        category: 'Intero Appartamento',
        location: 'Torino, Docks',
        image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=2070&auto=format&fit=crop',
        description: 'Recupero di uno spazio industriale convertito in loft residenziale. Soppalchi in ferro e mattoni a vista.',
        stats: { area: '150 mq', duration: '5 mesi', budget: '€110k' }
    },
    {
        id: 5,
        title: 'Camera Zen',
        category: 'Camera da letto',
        location: 'Como, Vista lago',
        image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=2070&auto=format&fit=crop',
        description: 'Design ispirato al Japandi per una camera da letto che concilia il riposo. Toni neutri e materiali naturali.',
        stats: { area: '25 mq', duration: '2 settimane', budget: '€15k' }
    },
    {
        id: 6,
        title: 'Home Office Tech',
        category: 'Ufficio',
        location: 'Milano, Isola',
        image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?q=80&w=2042&auto=format&fit=crop',
        description: 'Studio professionale domestico ottimizzato per lo smart working, con insonorizzazione e cablaggio avanzato.',
        stats: { area: '20 mq', duration: '2 settimane', budget: '€12k' }
    }
];

const categories = ['Tutti', 'Soggiorno', 'Cucina', 'Bagno', 'Esterni'];

export function Portfolio() {
    const [activeCategory, setActiveCategory] = useState('Tutti');
    const [hoveredProject, setHoveredProject] = useState<number | null>(null);

    const filteredProjects = activeCategory === 'Tutti'
        ? projects
        : projects.filter(p => p.category === activeCategory);

    return (
        <section id="portfolio" className="py-24 bg-slate-950 relative overflow-hidden">
            <div className="container mx-auto px-4 md:px-6 relative z-10">

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-8">
                    <div>
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                            I Nostri Progetti
                        </h2>
                        <p className="text-slate-400 max-w-lg text-lg">
                            Esplora una selezione delle nostre migliori ristrutturazioni. Ogni progetto è unico, proprio come chi lo abita.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={cn(
                                    "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border",
                                    activeCategory === cat
                                        ? "bg-white text-slate-950 border-white"
                                        : "bg-transparent text-slate-400 border-slate-800 hover:border-slate-600 hover:text-white"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                <motion.div
                    layout
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
                >
                    <AnimatePresence>
                        {filteredProjects.map((project) => (
                            <motion.div
                                layout
                                key={project.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.3 }}
                                className="group relative aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer bg-slate-900"
                                onMouseEnter={() => setHoveredProject(project.id)}
                                onMouseLeave={() => setHoveredProject(null)}
                            >
                                <Image
                                    src={project.image}
                                    alt={project.title}
                                    fill
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />

                                {/* Overlay Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

                                {/* Content */}
                                <div className="absolute inset-0 p-6 flex flex-col justify-end translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                    <div className="relative z-20">
                                        <p className="text-blue-400 text-sm font-medium mb-2 transform -translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 delay-75">
                                            {project.category}
                                        </p>

                                        <h3 className="text-2xl font-bold text-white mb-2">{project.title}</h3>

                                        <p className="text-slate-300 text-sm line-clamp-2 max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300 delay-100 mb-4">
                                            {project.description}
                                        </p>

                                        <div className="flex gap-4 border-t border-white/10 pt-4 mt-2 max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300 delay-150">
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Area</p>
                                                <p className="text-xs text-white font-medium">{project.stats.area}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tempo</p>
                                                <p className="text-xs text-white font-medium">{project.stats.duration}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Budget</p>
                                                <p className="text-xs text-white font-medium">{project.stats.budget}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Corner Button */}
                                <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-200">
                                    <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-white hover:bg-white hover:text-black transition-colors">
                                        <ArrowUpRight className="w-5 h-5" />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>

                <div className="mt-16 text-center">
                    <Button variant="outline" size="lg" className="px-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
                        Visualizza tutti i progetti
                    </Button>
                </div>

            </div>
        </section>
    );
}
