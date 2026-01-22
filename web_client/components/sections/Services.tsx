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
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: Ruler,
        title: 'Rilievi Precisi',
        description: 'Trasforma le foto del tuo smartphone in planimetrie CAD accurate. La nostra tecnologia elimina gli errori di misurazione manuale.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: Calculator,
        title: 'Preventivi Istantanei',
        description: 'Niente più attese di settimane. Ottieni una stima dettagliata dei costi in tempo reale, basata sui prezzi di mercato attuali e sui materiali scelti.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: LayoutDashboard,
        title: 'Gestione Dashboard',
        description: 'Controlla ogni aspetto del cantiere dalla tua area personale: avanzamento lavori, documenti, fatture e comunicazioni con il team.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: HardHat,
        title: 'Direzione Lavori',
        description: 'I nostri architetti partner seguono il tuo cantiere passo dopo passo, garantendo che l\'esecuzione rispecchi perfettamente il progetto approvato.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: Home,
        title: 'Chiavi in Mano',
        description: 'Rilassati e goditi il risultato. Gestiamo tutto noi, dalla burocrazia alle pulizie finali, consegnandoti una casa pronta da vivere.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    }
];

export function Services() {
    return (
        <section id="services" className="py-20 relative bg-luxury-bg">

            {/* Section Background Decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl opacity-30 pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 bg-luxury-teal/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-luxury-gold/5 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                {/* Header */}
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-serif font-bold text-luxury-text mb-4"
                    >
                        Tecnologia al servizio del <span className="text-luxury-gold italic">Design</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-luxury-text/70 text-lg font-light"
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
                            className="group relative p-6 rounded-2xl bg-white/5 border border-luxury-gold/10 hover:border-luxury-gold/30 transition-all duration-300 backdrop-blur-sm"
                        >
                            {/* Card Gradient Background on Hover */}
                            <div className={cn(
                                "absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-500",
                                service.gradient
                            )} />

                            <div className="relative z-10">
                                <div className={cn(
                                    "w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-luxury-bg/50 border border-luxury-gold/10 group-hover:scale-110 transition-transform duration-300",
                                    service.iconColor
                                )}>
                                    <service.icon className="w-6 h-6" />
                                </div>

                                <h3 className="text-xl font-semibold text-luxury-text mb-3 group-hover:text-luxury-gold transition-colors">
                                    {service.title}
                                </h3>

                                <p className="text-luxury-text/60 text-sm leading-relaxed group-hover:text-luxury-text/80 transition-colors font-light">
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
