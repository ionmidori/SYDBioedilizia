"use client"

import { FolderKanban, Plus, ListChecks, X } from "lucide-react"
import { ScallopedInlineLoader } from "@/components/ui/ScallopedPageTransition"
import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from "@/components/ui/button"
import { useProjects } from "@/hooks/use-projects"
import { ProjectCard } from "@/components/dashboard/ProjectCard"
import { CreateProjectDialog } from "@/components/dashboard/CreateProjectDialog"
import { FloatingBatchBar } from "@/components/dashboard/FloatingBatchBar"
import { BatchSubmitModal } from "@/components/dashboard/BatchSubmitModal"

/**
 * Projects that have status 'quoted' or 'draft' with a quote
 * are eligible for batch submission. For now we consider 'quoted'
 * and 'draft' as potentially having quotes — the backend validates.
 */
const QUOTE_ELIGIBLE_STATUSES = new Set(['draft', 'quoted', 'analyzing']);

export function ProjectListClient() {
    const { data: projects = [], isLoading, isError, error: queryError, refetch } = useProjects();
    const error = isError ? (queryError as Error)?.message ?? 'Errore caricamento' : null;
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    // ── Multi-select state ──────────────────────────────────────────────
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [submitModalOpen, setSubmitModalOpen] = useState(false);

    const handleCreateProject = () => {
        setCreateDialogOpen(true);
    };

    const handleDeleteProject = () => {
        refetch();
    };

    const toggleSelectMode = useCallback(() => {
        setSelectMode((prev) => {
            if (prev) setSelectedIds(new Set()); // clear on exit
            return !prev;
        });
    }, []);

    const handleToggleSelect = useCallback((sessionId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
                next.delete(sessionId);
            } else {
                next.add(sessionId);
            }
            return next;
        });
    }, []);

    const handleBatchCancel = useCallback(() => {
        setSelectedIds(new Set());
        setSelectMode(false);
    }, []);

    const handleBatchSubmit = useCallback(() => {
        setSubmitModalOpen(true);
    }, []);

    const handleBatchSuccess = useCallback(() => {
        setSelectedIds(new Set());
        setSelectMode(false);
        refetch();
    }, [refetch]);

    const selectedProjects = useMemo(
        () => projects.filter((p) => selectedIds.has(p.session_id)),
        [projects, selectedIds]
    );

    // Determine which projects have quotes (heuristic: status is quoted or beyond)
    const quoteEligible = useMemo(
        () => new Set(projects.filter((p) => QUOTE_ELIGIBLE_STATUSES.has(p.status)).map((p) => p.session_id)),
        [projects]
    );

    const hasEligibleProjects = quoteEligible.size > 0;

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

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                    {/* Select Mode Toggle */}
                    {projects.length > 0 && hasEligibleProjects && (
                        <AnimatePresence mode="wait">
                            <motion.button
                                key={selectMode ? 'exit' : 'enter'}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={toggleSelectMode}
                                className={`group relative flex items-center gap-3 px-5 py-3 border rounded-xl overflow-hidden transition-all duration-300 shadow-lg ${
                                    selectMode
                                        ? 'bg-luxury-teal/10 border-luxury-teal/30 hover:border-luxury-teal/50 shadow-luxury-teal/5'
                                        : 'bg-white/5 border-luxury-text/15 hover:border-luxury-text/30 shadow-white/5'
                                }`}
                            >
                                <div className="relative z-10 flex items-center gap-2.5">
                                    {selectMode ? (
                                        <X className="w-4 h-4 text-luxury-teal" />
                                    ) : (
                                        <ListChecks className="w-4 h-4 text-luxury-text/70" />
                                    )}
                                    <span className={`font-bold text-xs whitespace-nowrap uppercase tracking-widest ${
                                        selectMode ? 'text-luxury-teal' : 'text-luxury-text/70'
                                    }`}>
                                        {selectMode ? 'Annulla' : 'Seleziona'}
                                    </span>
                                </div>
                            </motion.button>
                        </AnimatePresence>
                    )}

                    {/* Create Project */}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCreateProject}
                        className="group relative flex items-center gap-3 px-6 py-3 bg-luxury-gold/10 border border-luxury-gold/30 hover:border-luxury-gold/50 rounded-xl overflow-hidden transition-all duration-300 shadow-lg shadow-luxury-gold/5"
                    >
                        {/* Internal Glow Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/0 to-luxury-gold/0 group-hover:via-luxury-gold/10 transition-all duration-500 rounded-xl" />

                        <div className="relative z-10 flex items-center gap-3">
                            <div className="p-1.5 bg-luxury-gold/20 rounded-lg text-luxury-gold">
                                <Plus className="w-5 h-5" />
                            </div>
                            <span className="text-luxury-gold font-bold text-sm md:text-base whitespace-nowrap uppercase tracking-widest">
                                Nuovo Progetto
                            </span>
                        </div>
                    </motion.button>
                </div>
            </div>

            {/* Select Mode Banner */}
            <AnimatePresence>
                {selectMode && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-luxury-teal/5 border border-luxury-teal/15">
                            <ListChecks className="w-4 h-4 text-luxury-teal shrink-0" />
                            <p className="text-xs text-luxury-text/60 font-medium">
                                Seleziona i progetti da inviare al team per il preventivo finale.
                                Solo i progetti con una bozza di preventivo possono essere selezionati.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                    {projects.map((project, index) => (
                        <ProjectCard
                            key={project.session_id}
                            project={project}
                            index={index}
                            onDelete={handleDeleteProject}
                            selectable={selectMode}
                            selected={selectedIds.has(project.session_id)}
                            onToggleSelect={handleToggleSelect}
                            hasQuote={quoteEligible.has(project.session_id)}
                        />
                    ))}
                </div>
            )}

            {/* Floating Batch Action Bar */}
            <FloatingBatchBar
                selectedCount={selectedIds.size}
                onSubmit={handleBatchSubmit}
                onCancel={handleBatchCancel}
            />

            {/* Batch Submit Confirmation Modal */}
            <BatchSubmitModal
                open={submitModalOpen}
                onOpenChange={setSubmitModalOpen}
                selectedProjects={selectedProjects}
                onSuccess={handleBatchSuccess}
            />

            <CreateProjectDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
            />
        </div>
    )
}
