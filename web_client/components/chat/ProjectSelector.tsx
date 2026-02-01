"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FolderKanban, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectsApi } from '@/lib/projects-api';
import { ProjectListItem } from '@/types/projects';
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog';

interface ProjectSelectorProps {
    currentProjectId: string;
    onProjectSelect?: (projectId: string) => void; // Support custom handling (e.g. no navigation)
}

export function ProjectSelector({ currentProjectId, onProjectSelect }: ProjectSelectorProps) {
    const router = useRouter();
    const [projects, setProjects] = useState<ProjectListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Load projects ONLY when opening to save resources, or on mount? 
    // Better on mount so we can display the name correctly if logic requires, 
    // but here we just show "Select Project" or similar if name is missing? 
    // Actually, we usually want to show the CURRENT project name. 
    // We can infer it from the list.
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

    const currentProject = projects.find(p => p.session_id === currentProjectId);
    const displayName = currentProject ? currentProject.title : "Seleziona Progetto";

    // 🔄 STATE SYNC: Keep localStorage updated with current project
    useEffect(() => {
        if (currentProjectId) {
            localStorage.setItem('activeProjectId', currentProjectId);
        }
    }, [currentProjectId]);

    const handleSelect = (projectId: string) => {
        if (projectId === currentProjectId) {
            setIsOpen(false);
            return;
        }

        // Persist Project ID always (redundant if effect exists, but safe)
        localStorage.setItem('activeProjectId', projectId);

        // 🔥 Dispatch Custom Event for Realtime Sync
        window.dispatchEvent(new CustomEvent('projectChanged', { detail: projectId }));

        // If custom handler exists, use it and SKIP navigation
        if (onProjectSelect) {
            onProjectSelect(projectId);
            setIsOpen(false);
            return;
        }

        // Default: Navigate to Dashboard
        setIsOpen(false);
        router.push(`/dashboard/${projectId}`);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-luxury-gold/10 border border-luxury-gold/20 hover:bg-luxury-gold/20 transition-all group max-w-[160px]"
            >
                <div className="flex flex-col items-start text-left overflow-hidden">
                    <span className="text-[10px] uppercase text-luxury-gold/70 font-bold tracking-wider leading-none mb-0.5 whitespace-nowrap">
                        Progetto Attivo
                    </span>
                    <span className="text-sm font-medium text-luxury-text leading-none w-full truncate" title={displayName}>
                        {loading && projects.length === 0 ? "Caricamento..." : displayName}
                    </span>
                </div>
                <ChevronDown className={cn(
                    "w-4 h-4 text-luxury-gold/70 transition-transform duration-200 flex-shrink-0",
                    isOpen && "rotate-180"
                )} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 max-h-[300px] overflow-y-auto rounded-xl border border-luxury-gold/20 bg-[#0f1014]/95 backdrop-blur-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col p-1 custom-scrollbar">
                    {loading && projects.length === 0 && (
                        <div className="flex items-center justify-center p-4 text-luxury-gold">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    )}

                    {!loading && projects.length === 0 && (
                        <div className="p-3 text-center text-xs text-white/50">
                            Nessun altro progetto
                        </div>
                    )}

                    {projects.map((proj) => (
                        <button
                            key={proj.session_id}
                            onClick={() => handleSelect(proj.session_id)}
                            className={cn(
                                "flex items-center gap-3 w-full p-2.5 rounded-lg text-left transition-colors",
                                proj.session_id === currentProjectId
                                    ? "bg-luxury-gold/20 text-luxury-gold"
                                    : "hover:bg-white/5 text-luxury-text/80 hover:text-luxury-text"
                            )}
                        >
                            <div className={cn(
                                "p-1.5 rounded-md flex-shrink-0",
                                proj.session_id === currentProjectId ? "bg-luxury-gold/20" : "bg-white/5"
                            )}>
                                <FolderKanban className="w-4 h-4" />
                            </div>
                            <span className="flex-1 truncate text-sm font-medium">
                                {proj.title}
                            </span>
                            {proj.session_id === currentProjectId && (
                                <Check className="w-4 h-4 flex-shrink-0" />
                            )}
                        </button>
                    ))}

                    {/* New Project Action */}
                    <div className="h-px bg-white/10 my-1 mx-2" />
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            setShowCreateDialog(true);
                        }}
                        className="flex items-center gap-3 w-full p-2.5 rounded-lg text-left transition-colors hover:bg-luxury-gold/10 text-luxury-gold hover:text-luxury-gold/80"
                    >
                        <div className="p-1.5 rounded-md bg-luxury-gold/10 flex-shrink-0">
                            <FolderKanban className="w-4 h-4" />
                        </div>
                        <span className="flex-1 text-sm font-bold">
                            + Nuovo Progetto
                        </span>
                    </button>
                </div>
            )}

            <CreateProjectDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                onProjectCreated={(newProjectId) => {
                    // Refresh local list (optimistic or re-fetch)
                    // Then select
                    // For now, simpler to just trigger select, but we need to re-fetch to show title
                    // Triggering onProjectSelect will handle context switch
                    // Re-fetching project list might be needed if component doesn't unmount
                    // Let's force a reload of projects next time it opens or now
                    projectsApi.listProjects().then(setProjects);

                    if (onProjectSelect) {
                        onProjectSelect(newProjectId); // Sync Context
                    } else {
                        router.push(`/dashboard/${newProjectId}`);
                    }
                }}
            />
        </div>
    );
}
