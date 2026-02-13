'use client';

import { useState, useTransition } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
            <DialogContent className="w-[90%] max-w-[400px] rounded-3xl bg-luxury-bg/95 backdrop-blur-xl border border-luxury-gold/20 text-luxury-text p-6 shadow-2xl">
                <DialogHeader className="space-y-4">
                    <DialogTitle className="text-2xl font-bold font-serif text-luxury-gold text-center">
                        Nuovo Progetto
                    </DialogTitle>
                    <p className="text-center text-sm text-luxury-text/60">
                        Dai un nome al tuo spazio di lavoro per iniziare
                    </p>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 py-2">
                    <div className="space-y-2">
                        <input
                            {...register('title', { required: true })}
                            id="title"
                            placeholder="Es. Ristrutturazione Bagno"
                            className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-luxury-gold/50 focus:ring-1 focus:ring-luxury-gold/50 outline-none transition-all placeholder:text-white/20 text-center text-lg font-medium"
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
                        <Button
                            type="submit"
                            disabled={loading || isPending}
                            className="w-full h-12 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-xl text-base shadow-lg shadow-luxury-gold/20 transition-all hover:scale-[1.02]"
                        >
                            {(loading || isPending) ? <Loader2 className="w-5 h-5 animate-spin" /> : "Crea e Inizia"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            className="w-full hover:bg-transparent text-luxury-text/40 hover:text-luxury-text/70 text-sm"
                        >
                            Annulla
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
