"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Loader2, Check, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectsApi } from '@/lib/projects-api';
import { ProjectListItem } from '@/types/projects';
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog';

interface ProjectListProps {
    currentProjectId?: string;
    onProjectSelect?: (projectId: string) => void;
    className?: string;
}

export function ProjectList({ currentProjectId, onProjectSelect, className }: ProjectListProps) {
    const router = useRouter();
    const [projects, setProjects] = useState<ProjectListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                const list = await projectsApi.listProjects();
                setProjects(list);
            } catch (err) {
                console.error("Failed to load projects", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const filteredProjects = projects.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelect = (projectId: string) => {
        // Persist Project ID always
        localStorage.setItem('activeProjectId', projectId);

        // Dispatch Custom Event for Realtime Sync
        window.dispatchEvent(new CustomEvent('projectChanged', { detail: projectId }));

        if (onProjectSelect) {
            onProjectSelect(projectId);
        } else {
            router.push(`/dashboard/${projectId}`);
        }
    };

    return (
        <div className={cn("flex flex-col h-full bg-luxury-bg/95 backdrop-blur-xl", className)}>
            <div className="p-4 border-b border-luxury-gold/10">
                <h2 className="text-xl font-serif font-bold text-luxury-gold mb-4">I Miei Progetti</h2>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-text/40" />
                    <input
                        type="text"
                        placeholder="Cerca progetto..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-luxury-gold/20 rounded-xl pl-9 pr-4 py-2 text-sm text-luxury-text focus:outline-none focus:border-luxury-gold/50 transition-colors"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
                {loading && (
                    <div className="flex items-center justify-center p-8 text-luxury-gold">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                )}

                {!loading && filteredProjects.length === 0 && (
                    <div className="p-8 text-center text-luxury-text/40 text-sm">
                        {searchQuery ? "Nessun progetto trovato" : "Nessun progetto attivo"}
                    </div>
                )}

                {filteredProjects.map((proj) => (
                    <button
                        key={proj.session_id}
                        onClick={() => handleSelect(proj.session_id)}
                        className={cn(
                            "flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all active:scale-[0.98]",
                            proj.session_id === currentProjectId
                                ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/20"
                                : "hover:bg-white/5 text-luxury-text/80 hover:text-luxury-text border border-transparent"
                        )}
                    >
                        <div className={cn(
                            "p-2 rounded-lg flex-shrink-0 transition-colors",
                            proj.session_id === currentProjectId ? "bg-luxury-gold/20" : "bg-white/5"
                        )}>
                            <FolderKanban className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="block truncate text-sm font-bold">
                                {proj.title}
                            </span>
                            <span className="block truncate text-xs text-luxury-text/40 mt-0.5">
                                Ultima modifica: {new Date().toLocaleDateString()}
                            </span>
                        </div>
                        {proj.session_id === currentProjectId && (
                            <Check className="w-5 h-5 flex-shrink-0" />
                        )}
                    </button>
                ))}
            </div>

            <div className="p-4 border-t border-luxury-gold/10 bg-white/5">
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="flex items-center justify-center gap-2 w-full p-3 bg-luxury-gold text-luxury-bg font-bold rounded-xl shadow-lg shadow-luxury-gold/20 active:scale-[0.98] transition-all"
                >
                    <Plus className="w-5 h-5" />
                    Nuovo Progetto
                </button>
            </div>

            <CreateProjectDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                onProjectCreated={(newProjectId) => {
                    projectsApi.listProjects().then(setProjects);
                    handleSelect(newProjectId);
                }}
            />
        </div>
    );
}
