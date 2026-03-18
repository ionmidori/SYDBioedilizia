'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { testimonialFormSchema, type TestimonialFormValues } from "@/schemas/testimonial-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const defaultTestimonials = [
    {
        id: 1,
        name: 'Marco Rossi',
        role: 'Imprenditore',
        location: 'Milano',
        text: "Ero scettico sull'uso dell'IA per una ristrutturazione, ma il livello di dettaglio dei render preliminari mi ha sbalordito. Abbiamo risparmiato settimane di indecisioni scelte sui materiali.",
        rating: 5,
        initials: 'MR',
        gradient: 'from-luxury-gold to-yellow-600'
    },
    {
        id: 2,
        name: 'Sofia Bianchi',
        role: 'Architetto',
        location: 'Roma',
        text: "Come professionista, apprezzo la precisione dei rilievi e la facilità di gestione del cantiere tramite la dashboard. Un partner tecnologico, non solo un'impresa.",
        rating: 5,
        initials: 'SB',
        gradient: 'from-luxury-teal to-emerald-600'
    },
    {
        id: 3,
        name: 'Luca e Giulia',
        role: 'Coppia',
        location: 'Firenze',
        text: "Volevamo ristrutturare il nostro primo appartamento senza stress. Il preventivo è stato rispettato al centesimo e la consegna è avvenuta in anticipo. Incredibile.",
        rating: 5,
        initials: 'LG',
        gradient: 'from-luxury-bg to-luxury-teal'
    }
];

export function Testimonials() {
    const [hoveredTestimonial, setHoveredTestimonial] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const { user } = useAuth();
    
    // Review Form State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    const form = useForm<TestimonialFormValues>({
        resolver: zodResolver(testimonialFormSchema),
        defaultValues: {
            rating: 5,
            text: "",
        },
    });

    // Mobile detection
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize(); // Initial check
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isRegisteredUser = user && !user.isAnonymous;

    async function onSubmit(data: TestimonialFormValues) {
        if (!user) return;
        
        try {
            await addDoc(collection(db, 'testimonials'), {
                userId: user.uid,
                name: user.displayName || 'Utente SYD',
                text: data.text.trim(),
                rating: data.rating,
                createdAt: serverTimestamp(),
                status: 'pending' // For admin approval
            });
            setSubmitSuccess(true);
            setTimeout(() => {
                setIsDialogOpen(false);
                setSubmitSuccess(false);
                form.reset();
            }, 2000);
        } catch (error) {
            console.error("Error submitting review:", error);
        }
    }

    return (
        <section id="testimonials" className="py-24 relative bg-luxury-bg overflow-hidden">

            {/* Background Decor */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-luxury-teal/20 rounded-full blur-[80px]" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-luxury-gold/20 rounded-full blur-[80px]" />
            </div>

            <div className="container mx-auto px-4 md:px-6 relative z-10">

                <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16 relative">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center justify-center p-3 mb-6 bg-luxury-bg/50 rounded-full border border-luxury-gold/20 backdrop-blur-sm"
                    >
                        <div className="flex gap-1 text-luxury-gold">
                            {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                        </div>
                        <span className="ml-3 text-sm text-luxury-text/80 font-medium">Trusted by 500+ Homeowners</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-serif font-bold text-luxury-text mb-6"
                    >
                        Dicono di <span className="text-luxury-gold italic">Noi</span>
                    </motion.h2>

                    {/* Action Button for Registered Users */}
                    <AnimatePresence>
                        {isRegisteredUser && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2"
                            >
                                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="rounded-full border-luxury-gold/30 text-luxury-gold hover:bg-luxury-gold/10 hover:text-luxury-gold gap-2">
                                            <Plus className="w-4 h-4" /> Lascia una recensione
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md bg-luxury-bg border-luxury-gold/20 text-luxury-text">
                                        <DialogHeader>
                                            <DialogTitle className="font-serif text-2xl text-luxury-gold">La tua esperienza con SYD</DialogTitle>
                                        </DialogHeader>
                                        
                                        {submitSuccess ? (
                                            <div className="py-8 text-center flex flex-col items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                                    <Star className="w-6 h-6 fill-current" />
                                                </div>
                                                <p className="text-lg font-medium">Grazie per la tua recensione!</p>
                                                <p className="text-sm text-luxury-text/60">Il tuo feedback è prezioso per noi.</p>
                                            </div>
                                        ) : (
                                            <Form {...form}>
                                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="rating"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-3">
                                                                <FormLabel className="text-sm font-medium text-luxury-text/80">Valutazione</FormLabel>
                                                                <FormControl>
                                                                    <div className="flex gap-2">
                                                                        {[1, 2, 3, 4, 5].map((star) => (
                                                                            <button
                                                                                key={star}
                                                                                type="button"
                                                                                onClick={() => field.onChange(star)}
                                                                                className={cn(
                                                                                    "p-1 transition-all hover:scale-110",
                                                                                    star <= field.value ? "text-luxury-gold" : "text-luxury-text/20"
                                                                                )}
                                                                            >
                                                                                <Star className={cn("w-8 h-8", star <= field.value && "fill-current")} />
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="text"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-3">
                                                                <FormLabel className="text-sm font-medium text-luxury-text/80">Cosa ne pensi?</FormLabel>
                                                                <FormControl>
                                                                    <Textarea 
                                                                        {...field}
                                                                        placeholder="Racconta la tua esperienza con i nostri servizi..."
                                                                        className="min-h-[120px] resize-none bg-black/20 border-luxury-gold/10 focus-visible:ring-luxury-gold/30"
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <div className="pt-2 flex justify-end">
                                                        <Button 
                                                            type="submit" 
                                                            disabled={form.formState.isSubmitting}
                                                            className="w-full sm:w-auto bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-full"
                                                        >
                                                            {form.formState.isSubmitting ? (
                                                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Invio in corso...</>
                                                            ) : (
                                                                'Invia Recensione'
                                                            )}
                                                        </Button>
                                                    </div>
                                                </form>
                                            </Form>
                                        )}
                                    </DialogContent>
                                </Dialog>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {defaultTestimonials.map((t, idx) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30% 0px -30% 0px" }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ scale: 1.02 }}
                            onViewportEnter={() => isMobile && setHoveredTestimonial(t.id)}
                            onViewportLeave={() => isMobile && setHoveredTestimonial(prev => prev === t.id ? null : prev)}
                            onMouseEnter={() => !isMobile && setHoveredTestimonial(t.id)}
                            onMouseLeave={() => !isMobile && setHoveredTestimonial(null)}
                            className={cn(
                                "relative p-8 rounded-3xl bg-white/5 border border-luxury-gold/10 shadow-xl group hover:border-luxury-gold/30 transition-all backdrop-blur-sm hover:scale-[1.02]",
                                hoveredTestimonial === t.id && "border-luxury-gold/30 scale-[1.02]"
                            )}
                        >
                            <Quote className={cn(
                                "absolute top-8 right-8 w-12 h-12 text-luxury-gold/10 group-hover:text-luxury-gold/20 transition-colors",
                                hoveredTestimonial === t.id && "text-luxury-gold/20"
                            )} />

                            <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-serif font-bold text-xl shadow-lg border border-white/10`}>
                                        {t.initials}
                                    </div>
                                    <div>
                                        <h4 className="text-luxury-text font-bold text-lg leading-tight">{t.name}</h4>
                                        <p className="text-luxury-text/60 text-sm font-light">{t.role} • {t.location}</p>
                                    </div>
                                </div>

                                <div className="flex gap-1 text-luxury-gold mb-4">
                                    {[...Array(t.rating)].map((_, i) => (
                                        <Star key={i} className="w-4 h-4 fill-current" />
                                    ))}
                                </div>

                                <p className="text-luxury-text/80 leading-relaxed italic font-light">
                                    &quot;{t.text}&quot;
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
