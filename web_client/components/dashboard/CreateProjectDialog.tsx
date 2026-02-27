'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProjectSchema, type CreateProjectValues } from '@/lib/validation/project-actions-schema';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/use-create-project';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';

import { triggerHaptic } from '@/utils/haptics';

interface CreateProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onProjectCreated?: (projectId: string) => void;
}

export function CreateProjectDialog({ open, onOpenChange, onProjectCreated }: CreateProjectDialogProps) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();
    const { mutate: createProject, isPending } = useCreateProject();

    const form = useForm<CreateProjectValues>({
        resolver: zodResolver(createProjectSchema),
        defaultValues: {
            title: ''
        }
    });

    const onSubmit = (data: CreateProjectValues) => {
        setErrorMessage(null);
        createProject({ title: data.title || 'Nuovo Progetto' }, {
            onSuccess: ({ session_id }) => {
                onOpenChange(false);
                form.reset();
                if (onProjectCreated) {
                    onProjectCreated(session_id);
                } else {
                    router.push(`/dashboard/${session_id}`);
                }
            },
            onError: (error) => {
                const message = error instanceof Error ? error.message : 'Impossibile creare il progetto';
                setErrorMessage(message);
            }
        });
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setErrorMessage(null);
            form.reset();
        }
        onOpenChange(nextOpen);
    };

    return (
        <ResponsiveDrawer
            open={open}
            onOpenChange={handleOpenChange}
            title="Nuovo Progetto"
            description="Dai un nome al tuo spazio di lavoro per iniziare"
            className="w-[90%] max-w-[400px] sm:rounded-3xl bg-luxury-bg/95 backdrop-blur-xl border border-luxury-gold/20 text-luxury-text p-6 shadow-2xl overflow-hidden sm:mx-auto"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                    duration: 0.5,
                    ease: [0.05, 0.7, 0.1, 1.0]
                }}
            >
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 py-2">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem className="space-y-2">
                                    <FormLabel className="sr-only">Titolo Progetto</FormLabel>
                                    <FormControl>
                                        <input
                                            {...field}
                                            id="title"
                                            placeholder="Es. Ristrutturazione Bagno"
                                            className={`w-full px-6 py-4 rounded-2xl bg-luxury-bg/50 backdrop-blur-md border outline-none transition-all placeholder:text-luxury-text/20 text-center text-lg font-medium text-luxury-text ${form.formState.errors.title
                                                    ? "border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50"
                                                    : "border-luxury-gold/20 focus:border-luxury-gold/50 focus:ring-1 focus:ring-luxury-gold/50"
                                                }`}
                                            autoFocus
                                            autoComplete="off"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-center text-sm font-medium text-red-400 animate-in fade-in slide-in-from-top-1" />
                                </FormItem>
                            )}
                        />

                        <div className="flex flex-col gap-3">
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
                                onClick={() => triggerHaptic()}
                                disabled={isPending}
                                className="group relative w-full h-14 bg-luxury-gold/15 border border-luxury-gold/40 hover:border-luxury-gold/60 rounded-xl overflow-hidden transition-all duration-300 shadow-lg shadow-luxury-gold/10 flex items-center justify-center gap-3"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/10 to-luxury-gold/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="relative z-10 flex items-center justify-center gap-3">
                                    {isPending ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-luxury-gold" />
                                    ) : (
                                        <span className="text-luxury-gold font-bold text-base uppercase tracking-[0.2em]">
                                            Crea e Inizia
                                        </span>
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
                        </div>
                    </form>
                </Form>
            </motion.div>
        </ResponsiveDrawer>
    );
}
