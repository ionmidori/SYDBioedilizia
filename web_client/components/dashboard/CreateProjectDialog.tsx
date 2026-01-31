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
}

interface FormData {
    title: string;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
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
            router.push(`/dashboard/${session_id}`);
        } catch (error) {
            console.error('Failed to create project:', error);
            // Ideally show toast error here
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-luxury-bg border border-luxury-gold/20 text-luxury-text">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold font-serif text-luxury-gold">
                        Crea Nuovo Progetto
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
                    <div className="space-y-2">
                        <label htmlFor="title" className="text-sm font-medium text-luxury-text/70">
                            Nome del Progetto
                        </label>
                        <input
                            {...register('title', { required: true })}
                            id="title"
                            placeholder="Es. Ristrutturazione Villa Rossi"
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
                            Crea Progetto
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
