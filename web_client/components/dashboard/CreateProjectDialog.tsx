'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
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
    const router = useRouter();
    const { register, handleSubmit, reset } = useForm<FormData>({
        defaultValues: {
            title: ''
        }
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            const { session_id } = await projectsApi.createProject({
                title: data.title || 'Nuovo Progetto'
            });

            onOpenChange(false);
            reset();

            // Custom handling (e.g. Chat reset) or Default Navigation
            if (onProjectCreated) {
                onProjectCreated(session_id);
            } else {
                router.push(`/dashboard/${session_id}`);
            }
        } catch (error) {
            console.error('Failed to create project:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-xl text-base shadow-lg shadow-luxury-gold/20 transition-all hover:scale-[1.02]"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Crea e Inizia"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
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
