'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Settings, ArrowRight, Info } from "lucide-react";
import { projectsApi } from "@/lib/projects-api";
import { ProjectListItem } from "@/types/projects";
import { Button } from "@/components/ui/button";

import { useProjects } from "@/hooks/useProjects";
import { ScallopedInlineLoader } from "@/components/ui/ScallopedPageTransition";

export default function GlobalSettingsPage() {
    const { projects, loading: isLoading, error: projectsError } = useProjects();
    const [error, setError] = useState<string | null>(null);

    // Update local error if hook has error
    useEffect(() => {
        if (projectsError) setError(projectsError);
    }, [projectsError]);

    return (
        <div className="max-w-4xl mx-auto py-12 px-6 space-y-12">
            {/* Header */}
            <div className="border-b border-luxury-gold/10 pb-8">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-luxury-text font-serif flex items-center gap-4">
                    <div className="p-3 bg-luxury-gold/10 rounded-2xl border border-luxury-gold/20 shadow-lg shadow-luxury-gold/5">
                        <Settings className="w-8 h-8 text-luxury-gold" />
                    </div>
                    Impostazioni
                </h1>
                <p className="text-luxury-text/60 mt-4 font-medium max-w-2xl">
                    Gestisci le configurazioni e i dettagli tecnici per ciascuno dei tuoi cantieri in totale controllo.
                </p>
            </div>

            {/* Info Box */}
            <div className="glass-premium border-luxury-teal/20 p-6 rounded-2xl flex gap-4 text-sm text-luxury-text/80 shadow-xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-luxury-teal/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="p-2 bg-luxury-teal/20 rounded-lg shrink-0 h-fit">
                    <Info className="w-5 h-5 text-luxury-teal" />
                </div>
                <p className="leading-relaxed relative z-10">
                    Le impostazioni sono <span className="text-luxury-gold font-bold">specifiche per ogni progetto</span>. Seleziona un progetto qui sotto per configurare i dettagli del cantiere, il budget e i vincoli tecnici necessari per l'assistente AI.
                </p>
            </div>

            {/* Project Selection List */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-luxury-text flex items-center gap-3 font-serif">
                    <FolderKanban className="w-6 h-6 text-luxury-gold/70" />
                    Seleziona un Progetto
                </h2>

                {isLoading ? (
                    <ScallopedInlineLoader />
                ) :projects.length === 0 ? (
                    <div className="text-center py-16 glass-premium border-dashed border-luxury-gold/20 rounded-[2rem]">
                        <p className="text-luxury-text/40 font-medium italic">Non hai ancora creato nessun progetto.</p>
                        <Button asChild variant="link" className="text-luxury-gold mt-4 font-bold tracking-widest uppercase text-xs hover:text-luxury-gold/80">
                            <Link href="/dashboard">Inizia ora <ArrowRight className="ml-2 w-4 h-4" /></Link>
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {projects.map((project) => (
                            <Link
                                key={project.session_id}
                                href={`/dashboard/${project.session_id}/settings`}
                                className="group flex items-center justify-between p-6 glass-premium border-luxury-gold/10 rounded-2xl hover:border-luxury-gold/40 hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-all duration-300 transform hover:-translate-y-1"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-xl bg-luxury-bg border border-luxury-gold/10 flex items-center justify-center text-luxury-gold transition-all duration-300 group-hover:bg-luxury-gold group-hover:text-luxury-bg shadow-inner">
                                        <Settings className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-luxury-text group-hover:text-luxury-gold transition-colors font-serif">
                                            {project.title || "Progetto Senza Titolo"}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-luxury-teal" />
                                            <p className="text-[10px] text-luxury-text/40 uppercase tracking-widest font-bold">
                                                Stato: {project.status}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-luxury-gold text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                    Configura <ArrowRight className="w-4 h-4" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
