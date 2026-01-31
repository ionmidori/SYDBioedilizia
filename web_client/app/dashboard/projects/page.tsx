"use client"

import { useRouter } from "next/navigation"
import { FolderKanban, Plus, Calendar, MessageSquare, ArrowRight, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import Link from "next/link"
import { useState } from 'react';

import { projectsApi } from "@/lib/projects-api"
import { Button } from "@/components/ui/button"
import { useProjects } from "@/hooks/useProjects"
import { ProjectCard } from "@/components/dashboard/ProjectCard"
import { CreateProjectDialog } from "@/components/dashboard/CreateProjectDialog"

export default function ProjectsPage() {
    const { projects, loading: isLoading, error, refresh } = useProjects();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    const handleCreateProject = () => {
        setCreateDialogOpen(true);
    };

    const handleDeleteProject = () => {
        refresh();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-luxury-gold animate-spin" />
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto space-y-12 py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-luxury-gold/10 pb-10 relative">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-luxury-teal/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="space-y-3 relative z-10">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-luxury-text font-serif leading-tight">
                        I Miei <span className="text-luxury-gold italic">Progetti</span>
                    </h1>
                    <p className="text-luxury-text/50 max-w-xl font-medium text-sm md:text-base leading-relaxed">
                        Gestisci tutte le tue ristrutturazioni e visualizza i tuoi preventivi intelligenti in un unico posto.
                    </p>
                </div>
                <Button
                    onClick={handleCreateProject}
                    className="h-14 px-8 bg-luxury-teal hover:bg-luxury-teal text-white font-extrabold rounded-2xl shadow-2xl shadow-luxury-teal/30 transition-all hover:scale-[1.03] active:scale-95 uppercase tracking-[0.2em] text-[10px] relative overflow-hidden group border border-white/10"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <Plus className="w-5 h-5 mr-3" />
                    Nuovo Progetto
                </Button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-900/20 text-red-500 rounded-xl border border-red-500/20 flex items-center gap-3 animate-shake">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {error}
                </div>
            )}

            {/* Empty State */}
            {projects.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-luxury-gold/20 rounded-[2.5rem] glass-premium relative overflow-hidden group">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-luxury-teal/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-luxury-teal/20 transition-all duration-700" />

                    <div className="p-8 bg-luxury-bg/80 border border-luxury-gold/10 rounded-3xl mb-8 ring-1 ring-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 transition-all duration-700 group-hover:scale-105 group-hover:border-luxury-gold/30">
                        <FolderKanban className="w-12 h-12 text-luxury-gold drop-shadow-[0_0_15px_rgba(233,196,106,0.3)]" />
                    </div>

                    <h3 className="text-xl md:text-2xl font-bold text-luxury-text mb-3 font-serif relative z-10">
                        Nessun progetto <span className="text-luxury-gold italic">trovato</span>
                    </h3>
                    <p className="text-luxury-text/40 max-w-md mb-8 font-medium text-sm md:text-base leading-relaxed relative z-10">
                        Non hai ancora creato nessun progetto. Inizia subito la tua prima ristrutturazione professionale con SYD.
                    </p>

                    <Button
                        onClick={handleCreateProject}
                        className="h-14 px-10 bg-luxury-gold hover:bg-luxury-gold text-luxury-bg font-extrabold hover:scale-[1.03] active:scale-95 transition-all shadow-2xl shadow-luxury-gold/20 relative z-10 rounded-2xl uppercase tracking-[0.2em] text-[10px] border border-white/20 group/btn overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-500" />
                        <span className="relative z-10">Inizia ora</span>
                    </Button>
                </div>
            )}

            {/* Projects Grid */}
            {projects.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {projects.map((project) => (
                        <ProjectCard key={project.session_id} project={project} onDelete={handleDeleteProject} />
                    ))}
                </div>
            )}

            <CreateProjectDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
            />
        </div>
    )
}
