'use client';

import { motion } from 'framer-motion';
import {
    Wand2,
    Ruler,
    LayoutDashboard,
    Calculator,
    HardHat,
    Home
} from 'lucide-react';
import { cn } from '@/lib/utils';

const services = [
    {
        icon: Wand2,
        title: 'Design Generativo AI',
        description: 'Genera centinaia di varianti di design per la tua casa in pochi secondi. Dal minimalismo moderno al classico, visualizza ogni stile prima di iniziare.',
        gradient: 'from-purple-500/20 to-blue-500/20',
        iconColor: 'text-purple-400'
    },
    {
        icon: Ruler,
        title: 'Rilievi Precisi',
        description: 'Trasforma le foto del tuo smartphone in planimetrie CAD accurate. La nostra tecnologia elimina gli errori di misurazione manuale.',
        gradient: 'from-blue-500/20 to-cyan-500/20',
        iconColor: 'text-blue-400'
    },
    {
        icon: Calculator,
        title: 'Preventivi Istantanei',
        description: 'Niente più attese di settimane. Ottieni una stima dettagliata dei costi in tempo reale, basata sui prezzi di mercato attuali e sui materiali scelti.',
        gradient: 'from-cyan-500/20 to-teal-500/20',
        iconColor: 'text-cyan-400'
    },
    {
        icon: LayoutDashboard,
        title: 'Gestione Dashboard',
        description: 'Controlla ogni aspetto del cantiere dalla tua area personale: avanzamento lavori, documenti, fatture e comunicazioni con il team.',
        gradient: 'from-teal-500/20 to-emerald-500/20',
        iconColor: 'text-teal-400'
    },
    {
        icon: HardHat,
        title: 'Direzione Lavori',
        description: 'I nostri architetti partner seguono il tuo cantiere passo dopo passo, garantendo che l\'esecuzione rispecchi perfettamente il progetto approvato.',
        gradient: 'from-emerald-500/20 to-green-500/20',
        iconColor: 'text-emerald-400'
    },
    {
        icon: Home,
        title: 'Chiavi in Mano',
        description: 'Rilassati e goditi il risultato. Gestiamo tutto noi, dalla burocrazia alle pulizie finali, consegnandoti una casa pronta da vivere.',
        gradient: 'from-green-500/20 to-lime-500/20',
        iconColor: 'text-green-400'
    }
];

export function Services() {
    return (
        <section id="services" className="py-20 relative bg-slate-950">

            {/* Section Background Decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl opacity-30 pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-900/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-900/20 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                {/* Header */}
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-4"
                    >
                        Tecnologia al servizio del Design
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-slate-400 text-lg"
                    >
                        Abbiamo reingegnerizzato il processo di ristrutturazione per renderlo semplice, trasparente e sorprendentemente veloce.
                    </motion.p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map((service, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            whileHover={{ y: -5 }}
                            className="group relative p-6 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-white/10 transition-all duration-300 backdrop-blur-sm"
                        >
                            {/* Card Gradient Background on Hover */}
                            <div className={cn(
                                "absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-500",
                                service.gradient
                            )} />

                            <div className="relative z-10">
                                <div className={cn(
                                    "w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-slate-800/50 group-hover:scale-110 transition-transform duration-300",
                                    service.iconColor
                                )}>
                                    <service.icon className="w-6 h-6" />
                                </div>

                                <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-blue-300 transition-colors">
                                    {service.title}
                                </h3>

                                <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">
                                    {service.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}
