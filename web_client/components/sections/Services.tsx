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
    Home
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { triggerHaptic } from '@/lib/haptics';
import { createStaggerVariants, M3Transition } from '@/lib/m3-motion';

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
        description: 'Genera centinaia di varianti di design per la tua casa in pochi secondi. Dal minimalismo moderno al classico, visualizza ogni stile.',
        gradient: 'from-luxury-teal/20 to-luxury-bg/20',
        iconColor: 'text-luxury-teal'
    },
    {
        icon: Calculator,
        title: 'Preventivi Istantanei',
        description: 'Niente più attese di settimane. Ottieni una stima dettagliata dei costi in tempo reale, basata sui prezzi di mercato attuali.',
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
        description: 'I nostri architetti partner seguono il tuo cantiere passo dopo passo, garantendo che l\'esecuzione rispecchi perfettamente il progetto.',
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

// Initialize staggered variants for the grid
const { container, item } = createStaggerVariants({ y: 30 }, 0.1);

export function Services() {
    const { user } = useAuth();
    const router = useRouter();
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [hoveredService, setHoveredService] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Mobile detection for hover states
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        const timerId = setTimeout(handleResize, 0);
        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(timerId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const handleCardClick = (serviceTitle: string) => {
        triggerHaptic();
        
        if (serviceTitle === 'Area personale') {
            if (user && !user.isAnonymous) {
                router.push('/dashboard');
            } else {
                setAuthDialogOpen(true);
            }
        } else {
            // Tutte le altre schede attivano l'IA
            const event = new CustomEvent('OPEN_CHAT');
            window.dispatchEvent(event);
        }
    };

    return (
        <section id="services" className="py-20 relative bg-luxury-bg overflow-hidden">
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
                        className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold text-luxury-text mb-4 tracking-tight"
                    >
                        Tecnologia al servizio del <span className="text-luxury-gold italic">Design</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-luxury-text/70 text-lg md:text-xl font-light"
                    >
                        Abbiamo reingegnerizzato il processo di ristrutturazione per renderlo semplice, trasparente e sorprendentemente veloce.
                    </motion.p>
                </div>

                {/* Orchestrated Staggered Grid */}
                <motion.div 
                    variants={container}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10% 0px" }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    {services.map((service, index) => (
                        <motion.div
                            key={index}
                            variants={item}
                            whileHover={{ y: -4, transition: M3Transition.containerTransform }}
                            whileTap={{ scale: 0.98, transition: M3Transition.buttonPress }}
                            onViewportEnter={() => isMobile && setHoveredService(index)}
                            onViewportLeave={() => isMobile && setHoveredService(prev => prev === index ? null : prev)}
                            onClick={() => handleCardClick(service.title)}
                            onMouseEnter={() => !isMobile && setHoveredService(index)}
                            onMouseLeave={() => !isMobile && setHoveredService(null)}
                            className={cn(
                                "group relative p-6 md:p-8 m3-shape-xl touch-pan-y cinematic-focus cursor-pointer transition-all duration-500",
                                "bg-white/5 border border-luxury-gold/10 backdrop-blur-md",
                                hoveredService === index 
                                    ? "border-luxury-gold/30 shadow-elevation-high shadow-luxury-teal/20" 
                                    : "shadow-elevation-low"
                            )}
                        >
                            {/* M3 Expressive State Layer (Hover/Active feedback) */}
                            <motion.div 
                                className="absolute inset-0 m3-shape-xl bg-luxury-gold/0 pointer-events-none"
                                animate={{ 
                                    backgroundColor: hoveredService === index ? "rgba(233, 196, 106, 0.03)" : "rgba(233, 196, 106, 0)",
                                    scale: hoveredService === index ? 1 : 0.95,
                                    opacity: hoveredService === index ? 1 : 0
                                }}
                                transition={M3Transition.gentleReveal}
                            />

                            {/* Card Gradient Background */}
                            <div className={cn(
                                "absolute inset-0 m3-shape-xl bg-gradient-to-br opacity-0 transition-opacity duration-500",
                                service.gradient,
                                hoveredService === index && "opacity-10"
                            )} />

                            <div className="relative z-10">
                                <div className={cn(
                                    "w-14 h-14 rounded-xl flex items-center justify-center mb-6 bg-luxury-bg/50 border border-luxury-gold/10 transition-transform duration-500",
                                    service.iconColor,
                                    hoveredService === index && "scale-110 shadow-premium"
                                )}>
                                    <service.icon className="w-7 h-7" />
                                </div>

                                <h3 className={cn(
                                    "font-serif text-xl md:text-2xl font-semibold text-luxury-text mb-3 transition-colors duration-300",
                                    hoveredService === index && "text-luxury-gold"
                                )}>
                                    {service.title}
                                </h3>

                                <motion.p 
                                    className="text-luxury-text/60 text-sm md:text-base leading-relaxed font-light transition-colors duration-300"
                                    animate={{ color: hoveredService === index ? "rgba(244, 241, 222, 0.85)" : "rgba(244, 241, 222, 0.6)" }}
                                >
                                    {service.description}
                                </motion.p>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
        </section>
    );
}