'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { renameProjectSchema, type RenameProjectValues } from '@/lib/validation/project-actions-schema';
import { motion } from 'framer-motion';
import { useUpdateProject } from '@/hooks/use-update-project';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { triggerHaptic } from '@/utils/haptics';

interface RenameProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentTitle: string;
    sessionId: string;
    onRename?: () => void;
}

export function RenameProjectDialog({
    open,
    onOpenChange,
    currentTitle,
    sessionId,
    onRename
}: RenameProjectDialogProps) {
    const { mutate: updateProject, isPending } = useUpdateProject();
    
    const { 
        register, 
        handleSubmit,
        formState: { errors } 
    } = useForm<RenameProjectValues>({
        resolver: zodResolver(renameProjectSchema),
        defaultValues: {
            title: currentTitle
        }
    });

    const onSubmit = (data: RenameProjectValues) => {
        updateProject(
            { id: sessionId, data: { title: data.title } },
            {
                onSuccess: () => {
                    onRename?.();
                    onOpenChange(false);
                },
                onError: (error) => {
                    console.error('Failed to rename project:', error);
                }
            }
        );
    };

    return (
        <ResponsiveDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="Rinomina Progetto"
            description="Modifica il nome del tuo cantiere"
            className="sm:max-w-md bg-luxury-bg border border-luxury-gold/20 text-luxury-text overflow-hidden sm:mx-auto"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                    duration: 0.5,
                    ease: [0.05, 0.7, 0.1, 1.0]
                }}
            >
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
                    <div className="space-y-2">
                        <label htmlFor="title" className="text-sm font-medium text-luxury-text/70">
                            Nuovo Nome
                        </label>
                        <input
                            {...register('title')}
                            id="title"
                            className={`w-full px-4 py-3 rounded-xl bg-white/5 border outline-none transition-all placeholder:text-white/20 ${
                                errors.title 
                                    ? "border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50" 
                                    : "border-white/10 focus:border-luxury-gold/50 focus:ring-1 focus:ring-luxury-gold/50"
                            }`}
                            autoFocus
                        />
                        {errors.title && (
                            <p className="text-sm font-medium text-red-400 animate-in fade-in slide-in-from-top-1">
                                {errors.title.message}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="hover:bg-white/5 text-luxury-text/70 hover:text-luxury-text"
                        >
                            Annulla
                        </Button>
                        <Button
                            type="submit"
                            onClick={() => triggerHaptic()}
                            disabled={isPending}
                            className="bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold"
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Salva
                        </Button>
                    </div>
                </form>
            </motion.div>
        </ResponsiveDrawer>
    );
}
