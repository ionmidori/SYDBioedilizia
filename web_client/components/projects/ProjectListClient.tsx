"use client"

import { describeApiError } from '@/lib/api-client';
import { FolderKanban } from "lucide-react"
import { ScallopedInlineLoader } from "@/components/ui/ScallopedPageTransition"
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from "@/components/ui/button"
import { useProjects } from "@/hooks/use-projects"
import { ProjectCard } from "@/components/dashboard/ProjectCard"
import { useChatContext } from "@/hooks/useChatContext"

/**
 * `has_quote` (server-authoritative: the project's quote has items) and
 * `quote_status` drive the "Invia al team" button on each card: one project,
 * one quote with a section per room, sent on its own. The user has one chat
 * (Phase 139): nothing to create or delete here.
 */

export function ProjectListClient() {
    const { data: projects = [], isLoading, isError, error: queryError } = useProjects();
    const error = isError ? describeApiError(queryError) : null;
    const { userChatId } = useChatContext();
    const router = useRouter();

    // Determine which projects truly have quotes (server-authoritative)
    const quoteEligible = useMemo(
        () => new Set(projects.filter((p) => p.has_quote).map((p) => p.session_id)),
        [projects]
    );

    if (isLoading) {
        return (
            <ScallopedInlineLoader />
        )
    }

    return (
        <div className="max-w-7xl mx-auto space-y-12 py-6 px-4 md:px-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-luxury-gold/10 pb-10 relative">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-luxury-teal/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="space-y-3 relative z-10 flex-1">
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-luxury-text font-serif leading-tight flex items-center gap-4">
                        <div className="p-2 md:p-3 bg-luxury-gold/10 rounded-xl md:rounded-2xl border border-luxury-gold/20 shadow-lg shadow-luxury-gold/5 shrink-0">
                            <FolderKanban className="w-6 h-6 md:w-8 md:h-8 text-luxury-gold" />
                        </div>
                        <span className="flex-1">
                            I Miei <span className="text-luxury-gold italic">Progetti</span>
                        </span>
                    </h1>
                    <p className="text-luxury-text/50 max-w-xl font-medium text-xs md:text-sm leading-relaxed">
                        Gestisci tutte le tue ristrutturazioni e visualizza i tuoi preventivi intelligenti in un unico posto.
                    </p>
                </div>

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
                        Racconta in chat cosa vuoi ristrutturare: SYD ti guiderà passo dopo passo.
                    </p>

                    <Button
                        disabled={!userChatId}
                        onClick={() => router.push(`/dashboard/${userChatId}`)}
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
                    {projects.map((project, index) => (
                        <ProjectCard
                            key={project.session_id}
                            project={project}
                            index={index}
                            hasQuote={quoteEligible.has(project.session_id)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
