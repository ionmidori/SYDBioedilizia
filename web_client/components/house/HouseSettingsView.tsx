"use client";

import { AlertCircle } from 'lucide-react';
import ConstructionDetailsForm from '@/components/dashboard/ConstructionDetailsForm';
import { SydLoader } from '@/components/ui/SydLoader';
import { useProject } from '@/hooks/use-project';

/**
 * The details of the house (Phase 139): surface, type, address, budget and
 * notes of the user's one chat, the context SYD quotes and designs from.
 */
export function HouseSettingsView({ chatId }: { chatId: string }) {
    const { data: project, isLoading, error } = useProject(chatId);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[30vh]">
                <SydLoader size="lg" />
            </div>
        );
    }

    if (error || !project) {
        return (
            <div role="alert" className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                <AlertCircle aria-hidden="true" className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-200 font-medium">
                    Non riusciamo a leggere i dettagli della tua casa. Ricarica la pagina per riprovare.
                </p>
            </div>
        );
    }

    // The form has its own heading ("Dettagli della Casa").
    return <ConstructionDetailsForm sessionId={chatId} initialData={project.construction_details} />;
}
