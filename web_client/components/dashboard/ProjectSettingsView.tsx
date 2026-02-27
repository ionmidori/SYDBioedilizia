"use client";

import { useProject } from '@/hooks/use-project';
import ConstructionDetailsForm from '@/components/dashboard/ConstructionDetailsForm';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface ProjectSettingsViewProps {
    projectId: string;
}

export function ProjectSettingsView({ projectId }: ProjectSettingsViewProps) {
    const { user, loading: authLoading } = useAuth();
    
    // Modern State Management: Use TanStack Query
    const { data: project, isLoading: projectLoading, error } = useProject(projectId);

    // Show loading if either auth is loading or project is loading
    // But don't block if we're not authenticated (allow errors to show)
    const isLoading = authLoading || (user && projectLoading);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh]">
                <Loader2 className="w-10 h-10 text-luxury-gold animate-spin" />
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center h-[50vh]">
                <div className="p-4 bg-red-500/10 rounded-full mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-luxury-text mb-2">Errore</h3>
                <p className="text-luxury-text/60">
                    {error ? 'Errore nel caricamento del progetto' : 'Progetto non trovato'}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full px-4 py-6 md:px-0 overflow-y-auto">
            <div className="mb-6 border-b border-luxury-gold/10 pb-4">
                <h1 className="text-3xl font-bold text-luxury-text font-serif">
                    Dettagli <span className="text-luxury-gold">Tecnici</span>
                </h1>
                <p className="text-sm text-luxury-text/50 mt-1">{project.title}</p>
            </div>

            <div className="flex-1 pb-20">
                <ConstructionDetailsForm
                    sessionId={projectId}
                    initialData={project.construction_details ?? undefined}
                />
            </div>
        </div>
    );
}
