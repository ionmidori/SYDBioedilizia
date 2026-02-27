'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Wand2,
    Ruler,
    LayoutDashboard,
    Calculator,
    HardHat,
    Home,
    Hammer,
    Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const services = [
    {
        icon: LayoutDashboard,
        title: 'Area personale',
        description: 'Controlla ogni aspetto del cantiere dalla tua area personale: avanzamento lavori, documenti, fatture e comunicazioni con il team.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: Wand2,
        title: 'Design Generativo AI',
        description: 'Genera centinaia di varianti di design per la tua casa in pochi secondi. Dal minimalismo moderno al classico, visualizza ogni stile prima di iniziare.',
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
        icon: Ruler,
        title: 'Rilievi Precisi',
        description: 'Trasforma le foto del tuo smartphone in planimetrie CAD accurate. La nostra tecnologia elimina gli errori di misurazione manuale.',
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
    const { user } = useAuth();
    const router = useRouter();
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [hoveredService, setHoveredService] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [comingSoon, setComingSoon] = useState<{ title: string; open: boolean }>({ title: '', open: false });

    // Mobile detection
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        
        // Initial check wrapped in timeout to avoid sync setState warning
        const timerId = setTimeout(handleResize, 0);
        
        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(timerId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

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
                            viewport={{ once: true, margin: "-30% 0px -30% 0px" }}
                            transition={{ delay: index * 0.1 }}
                            whileHover={{ y: -5 }}
                            whileTap={{ scale: 0.98 }}
                            onViewportEnter={() => isMobile && setHoveredService(index)}
                            onViewportLeave={() => isMobile && setHoveredService(prev => prev === index ? null : prev)}
                            onClick={() => {
                                if (service.title === 'Area personale') {
                                    // If user is already authenticated, go directly to dashboard
                                    if (user && !user.isAnonymous) {
                                        router.push('/dashboard');
                                    } else {
                                        // Otherwise, show auth dialog
                                        setAuthDialogOpen(true);
                                    }
                                } else if (service.title === 'Design Generativo AI' || service.title === 'Preventivi Istantanei') {
                                    const event = new CustomEvent('OPEN_CHAT');
                                    window.dispatchEvent(event);
                                } else {
                                    // Features in development
                                    setComingSoon({ title: service.title, open: true });
                                }
                            }}
                            onMouseEnter={() => !isMobile && setHoveredService(index)}
                            onMouseLeave={() => !isMobile && setHoveredService(null)}
                            className={cn(
                                "relative p-6 rounded-2xl bg-white/5 border border-luxury-gold/10 hover:border-luxury-gold/30 active:border-luxury-gold/50 transition-all duration-300 backdrop-blur-sm",
                                (service.title === 'Area personale' || service.title === 'Design Generativo AI' || service.title === 'Preventivi Istantanei' || service.title === 'Rilievi Precisi' || service.title === 'Direzione Lavori' || service.title === 'Chiavi in Mano') && "cursor-pointer hover:shadow-lg hover:shadow-luxury-teal/20 active:shadow-md active:bg-white/10",
                                hoveredService === index && "border-luxury-gold/30 shadow-lg shadow-luxury-teal/20"
                            )}
                        >
                            {/* Card Gradient Background on Hover/Active */}
                            <div className={cn(
                                "absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-10 group-active:opacity-20 transition-opacity duration-300",
                                service.gradient,
                                hoveredService === index && "opacity-10"
                            )} />

                            <div className="relative z-10">
                                <div className={cn(
                                    "w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-luxury-bg/50 border border-luxury-gold/10 group-hover:scale-110 transition-transform duration-300",
                                    service.iconColor,
                                    hoveredService === index && "scale-110"
                                )}>
                                    <service.icon className="w-6 h-6" />
                                </div>

                                <h3 className={cn(
                                    "text-xl font-semibold text-luxury-text mb-3 group-hover:text-luxury-gold transition-colors",
                                    hoveredService === index && "text-luxury-gold"
                                )}>
                                    {service.title}
                                </h3>

                                <p className={cn(
                                    "text-luxury-text/60 text-sm leading-relaxed group-hover:text-luxury-text/80 transition-colors font-light",
                                    hoveredService === index && "text-luxury-text/80"
                                )}>
                                    {service.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>
            <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />

            {/* Coming Soon Modal */}
            <AnimatePresence>
                {comingSoon.open && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-sm glass-premium p-8 rounded-[2.5rem] border-luxury-gold/20 shadow-2xl overflow-hidden group"
                        >
                            {/* Decorative Background Glow */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-luxury-teal/10 rounded-full blur-3xl pointer-events-none group-hover:bg-luxury-teal/20 transition-all duration-700" />

                            <button
                                onClick={() => setComingSoon({ ...comingSoon, open: false })}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-luxury-text/40 hover:text-luxury-gold transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            <div className="relative z-10 text-center space-y-6">
                                <div className="w-16 h-16 bg-luxury-teal/10 rounded-2xl border border-luxury-teal/20 flex items-center justify-center mx-auto shadow-inner group-hover:scale-110 transition-transform duration-500">
                                    <Hammer className="w-8 h-8 text-luxury-gold animate-pulse" />
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold font-serif text-luxury-text">
                                        <span className="text-luxury-gold italic">Prossimamente</span>
                                    </h3>
                                    <p className="text-sm font-light text-luxury-text/60 leading-relaxed">
                                        La funzione <span className="text-luxury-text font-medium">&quot;{comingSoon.title}&quot;</span> è attualmente in fase di sviluppo avanzato e sarà disponibile a breve per tutti i nostri clienti.
                                    </p>
                                </div>

                                <Button
                                    onClick={() => setComingSoon({ ...comingSoon, open: false })}
                                    className="w-full bg-luxury-teal hover:bg-luxury-teal/90 text-white font-bold uppercase tracking-widest text-[10px] h-12 rounded-xl border border-white/10 shadow-lg shadow-luxury-teal/20 transition-all hover:scale-[1.02] active:scale-95"
                                >
                                    Ho Capito
                                </Button>

                                <p className="text-[10px] text-luxury-text/30 font-bold uppercase tracking-[0.2em]">
                                    Professional Quality Guaranteed
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </section>
    );
}
