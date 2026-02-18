'use client';

import { useState, useTransition } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { projectsApi } from '@/lib/projects-api';
import { useRouter } from 'next/navigation';

interface CreateProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onProjectCreated?: (projectId: string) => void; // Optional callback to override navigation
}

interface FormData {
    title: string;
}

export function CreateProjectDialog({ open, onOpenChange, onProjectCreated }: CreateProjectDialogProps) {
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const { register, handleSubmit, reset } = useForm<FormData>({
        defaultValues: {
            title: ''
        }
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const { session_id } = await projectsApi.createProject({
                title: data.title || 'Nuovo Progetto'
            });

            onOpenChange(false);
            reset();
            setErrorMessage(null);

            startTransition(() => {
                if (onProjectCreated) {
                    onProjectCreated(session_id);
                } else {
                    router.push(`/dashboard/${session_id}`);
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Impossibile creare il progetto';
            setErrorMessage(message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) setErrorMessage(null);
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="w-[90%] max-w-[400px] rounded-3xl bg-luxury-bg/95 backdrop-blur-xl border border-luxury-gold/20 text-luxury-text p-6 shadow-2xl overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        ease: [0.05, 0.7, 0.1, 1.0]
                    }}
                >
                    <DialogHeader className="space-y-4">
                        <DialogTitle className="text-2xl font-bold font-serif text-luxury-gold text-center">
                            Nuovo Progetto
                        </DialogTitle>
                        <DialogDescription className="text-center text-sm text-luxury-text/60">
                            Dai un nome al tuo spazio di lavoro per iniziare
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 py-2">
                        <div className="space-y-2">
                            <input
                                {...register('title', { required: true })}
                                id="title"
                                placeholder="Es. Ristrutturazione Bagno"
                                className="w-full px-6 py-4 rounded-2xl bg-luxury-bg/50 backdrop-blur-md border border-luxury-gold/20 focus:border-luxury-gold/50 focus:ring-1 focus:ring-luxury-gold/50 outline-none transition-all placeholder:text-luxury-text/20 text-center text-lg font-medium text-luxury-text"
                                autoFocus
                                autoComplete="off"
                            />
                        </div>

                        <DialogFooter className="flex-col gap-3 sm:flex-col">
                            {errorMessage && (
                                <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                    <p className="text-sm font-medium text-red-400">{errorMessage}</p>
                                </div>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={loading || isPending}
                                className="group relative w-full h-14 bg-luxury-gold/15 border border-luxury-gold/40 hover:border-luxury-gold/60 rounded-xl overflow-hidden transition-all duration-300 shadow-lg shadow-luxury-gold/10 flex items-center justify-center gap-3"
                            >
                                {/* Internal Glow Effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/10 to-luxury-gold/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="relative z-10 flex items-center justify-center gap-3">
                                    {(loading || isPending) ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-luxury-gold" />
                                    ) : (
                                        <>
                                            <span className="text-luxury-gold font-bold text-base uppercase tracking-[0.2em]">
                                                Crea e Inizia
                                            </span>
                                        </>
                                    )}
                                </div>
                            </motion.button>
                            <button
                                type="button"
                                onClick={() => handleOpenChange(false)}
                                className="w-full py-2 bg-transparent text-luxury-text/40 hover:text-luxury-text/70 text-sm font-medium transition-colors"
                            >
                                Annulla
                            </button>
                        </DialogFooter>
                    </form>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
}
