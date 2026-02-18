'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { projectsApi } from '@/lib/projects-api';
import { motion } from 'framer-motion';

interface RenameProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentTitle: string;
    sessionId: string;
    onRename?: () => void;
}

interface FormData {
    title: string;
}

export function RenameProjectDialog({
    open,
    onOpenChange,
    currentTitle,
    sessionId,
    onRename
}: RenameProjectDialogProps) {
    const [loading, setLoading] = useState(false);
    const { register, handleSubmit } = useForm<FormData>({
        defaultValues: {
            title: currentTitle
        }
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            await projectsApi.updateProject(sessionId, { title: data.title });
            onRename?.();
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to rename project:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-md bg-luxury-bg border border-luxury-gold/20 text-luxury-text overflow-hidden"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        ease: [0.05, 0.7, 0.1, 1.0]
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold font-serif text-luxury-gold">
                            Rinomina Progetto
                        </DialogTitle>
                        <DialogDescription className="text-sm text-luxury-text/60">
                            Modifica il nome del tuo cantiere
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
                        <div className="space-y-2">
                            <label htmlFor="title" className="text-sm font-medium text-luxury-text/70">
                                Nuovo Nome
                            </label>
                            <input
                                {...register('title', { required: true })}
                                id="title"
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-luxury-gold/50 focus:ring-1 focus:ring-luxury-gold/50 outline-none transition-all placeholder:text-white/20"
                                autoFocus
                            />
                        </div>

                        <DialogFooter>
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
                                disabled={loading}
                                className="bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold"
                            >
                                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Salva
                            </Button>
                        </DialogFooter>
                    </form>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
}
