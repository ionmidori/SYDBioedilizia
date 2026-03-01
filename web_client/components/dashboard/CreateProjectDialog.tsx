'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProjectSchema, type CreateProjectValues } from '@/lib/validation/project-actions-schema';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/use-create-project';
import { SydLoader } from '@/components/ui/SydLoader';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

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
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="w-[90%] max-w-[380px] p-8 rounded-[32px] bg-luxury-bg/70 backdrop-blur-3xl border border-luxury-gold/20 text-luxury-text shadow-2xl overflow-hidden sm:mx-auto">
                {/* Hidden header for accessibility */}
                <DialogHeader className="sr-only">
                    <DialogTitle>Nuovo Progetto</DialogTitle>
                    <DialogDescription>Inserisci il nome del nuovo progetto</DialogDescription>
                </DialogHeader>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                        duration: 0.4,
                        ease: [0.05, 0.7, 0.1, 1.0]
                    }}
                >
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                            <div className="text-center space-y-2 mb-6">
                                <h2 className="text-xl font-serif font-bold text-luxury-text">Nuovo Progetto</h2>
                            </div>

                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="sr-only">Titolo Progetto</FormLabel>
                                        <FormControl>
                                            <input
                                                {...field}
                                                id="title"
                                                placeholder="Es. Casa Rossi"
                                                className={`w-full px-4 py-3 bg-transparent border-b outline-none transition-all placeholder:text-luxury-text/30 text-center text-xl font-medium text-luxury-text ${form.formState.errors.title
                                                    ? "border-red-500/50 focus:border-red-500"
                                                    : "border-luxury-gold/30 focus:border-luxury-gold"
                                                    }`}
                                                autoFocus
                                                autoComplete="off"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-center text-sm font-medium text-red-400 absolute w-full mt-1" />
                                    </FormItem>
                                )}
                            />

                            <div className="flex flex-col gap-4 mt-8 pt-4">
                                {errorMessage && (
                                    <div className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                        <p className="text-xs font-medium text-red-400">{errorMessage}</p>
                                    </div>
                                )}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    onClick={() => triggerHaptic()}
                                    disabled={isPending}
                                    className="group relative w-full h-12 bg-luxury-gold/20 border border-luxury-gold/50 hover:bg-luxury-gold hover:text-luxury-bg rounded-2xl overflow-hidden transition-all duration-300 shadow-lg shadow-luxury-gold/10 flex items-center justify-center gap-2"
                                >
                                    <div className="relative z-10 flex items-center justify-center gap-2">
                                        {isPending ? (
                                            <SydLoader size="md" />
                                        ) : (
                                            <span className="font-bold text-sm tracking-widest transition-colors">
                                                CREA
                                            </span>
                                        )}
                                    </div>
                                </motion.button>
                            </div>
                        </form>
                    </Form>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
}
