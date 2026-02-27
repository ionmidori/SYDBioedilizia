'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, FolderOpen, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/use-create-project';

export function ProjectsEmptyState() {
    const router = useRouter();
    const createProjectMutation = useCreateProject();
    const [error, setError] = useState<string | null>(null);

    const handleCreateProject = async () => {
        setError(null);
        try {
            const result = await createProjectMutation.mutateAsync({ title: 'Nuovo Progetto' });
            
            console.log('Provide creation result:', result);

            if (!result || !result.session_id) {
                throw new Error('La risposta del server non contiene un session_id valido: ' + JSON.stringify(result));
            }

            const { session_id } = result;
            router.push(`/dashboard/${session_id}`);
        } catch (error: any) {
            console.error('Failed to create project:', error);
            setError(error.message || 'Errore sconosciuto');
        }
    };

    const isCreating = createProjectMutation.isPending;

    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-luxury-gold/20 rounded-[2.5rem] glass-premium relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-luxury-teal/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-luxury-teal/20 transition-all duration-700" />

            <div className="p-8 bg-luxury-bg/80 border border-luxury-gold/10 rounded-3xl mb-8 ring-1 ring-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 transition-all duration-700 group-hover:scale-105 group-hover:border-luxury-gold/30">
                <FolderOpen className="w-12 h-12 text-luxury-gold drop-shadow-[0_0_15px_rgba(233,196,106,0.3)]" />
            </div>

            <h3 className="text-xl md:text-2xl font-bold text-luxury-text mb-3 font-serif relative z-10">
                Il tuo spazio è <span className="text-luxury-gold italic">vuoto</span>
            </h3>
            <p className="text-luxury-text/40 max-w-md mb-8 font-medium text-sm md:text-base leading-relaxed relative z-10">
                Inizia il tuo viaggio verso la casa dei sogni. Crea il tuo primo progetto e lascia che SYD ti guidi nella ristrutturazione professionale.
            </p>

            <Button
                onClick={handleCreateProject}
                disabled={isCreating}
                className="h-14 px-10 bg-luxury-gold hover:bg-luxury-gold text-luxury-bg font-extrabold hover:scale-[1.03] active:scale-95 transition-all shadow-2xl shadow-luxury-gold/20 relative z-10 rounded-2xl uppercase tracking-[0.2em] text-[10px] border border-white/20 group/btn overflow-hidden"
            >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-500" />
                <span className="relative z-10 flex items-center">
                    {isCreating ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin mr-3" />
                            Inizializzazione...
                        </>
                    ) : (
                        <>
                            <Plus className="w-5 h-5 mr-3" />
                            Crea Progetto SYD
                        </>
                    )}
                </span>
            </Button>

            {error && (
                <div className="mt-4 p-3 bg-red-900/20 text-red-500 rounded-lg text-sm max-w-sm break-all">
                    {error}
                </div>
            )}
        </div>
    );
}
