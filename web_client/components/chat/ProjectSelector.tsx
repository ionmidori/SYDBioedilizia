"use client";

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FolderKanban, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectListItem } from '@/types/projects';
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog';
import { useProjects } from '@/hooks/use-projects';

interface ProjectSelectorProps {
    currentProjectId: string;
    onProjectSelect?: (projectId: string) => void;
}

export function ProjectSelector({ currentProjectId, onProjectSelect }: ProjectSelectorProps) {
    const router = useRouter();
    const { data: projects = [], isLoading } = useProjects();
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

    const currentProject = projects.find((p: ProjectListItem) => p.session_id === currentProjectId);
    const displayName = currentProject ? currentProject.title : "Seleziona Progetto";

    const handleSelect = (projectId: string) => {
        if (projectId === currentProjectId) {
            setIsOpen(false);
            return;
        }

        setIsOpen(false);

        if (onProjectSelect) {
            onProjectSelect(projectId);
            return;
        }

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
                        {isLoading && projects.length === 0 ? "Caricamento..." : displayName}
                    </span>
                </div>
                <ChevronDown className={cn(
                    "w-4 h-4 text-luxury-gold/70 transition-transform duration-200 flex-shrink-0",
                    isOpen && "rotate-180"
                )} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-3 w-64 md:w-72 max-h-[350px] overflow-y-auto rounded-[1.5rem] border border-luxury-gold/20 bg-luxury-bg/80 backdrop-blur-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] z-50 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col p-2 custom-scrollbar">
                    {isLoading && projects.length === 0 && (
                        <div className="flex items-center justify-center p-6 text-luxury-gold">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    )}

                    {!isLoading && projects.length === 0 && (
                        <div className="p-4 text-center text-sm text-luxury-text/50">
                            Nessun altro progetto
                        </div>
                    )}

                    {projects.map((proj: ProjectListItem) => {
                        const isCurrent = proj.session_id === currentProjectId;
                        return (
                            <button
                                key={proj.session_id}
                                onClick={() => handleSelect(proj.session_id)}
                                className={cn(
                                    "flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all duration-300 group relative overflow-hidden",
                                    isCurrent ? "bg-luxury-gold/10" : "hover:bg-luxury-gold/5"
                                )}
                            >
                                {/* Inner glow on hover */}
                                <div className={cn(
                                    "absolute inset-0 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/5 to-luxury-gold/0 opacity-0 transition-opacity duration-500",
                                    isCurrent ? "opacity-100" : "group-hover:opacity-100"
                                )} />

                                <div className={cn(
                                    "p-2 rounded-lg flex-shrink-0 transition-colors duration-300 relative z-10",
                                    isCurrent ? "bg-luxury-gold/20 text-luxury-gold" : "bg-white/5 text-luxury-text/60 group-hover:bg-luxury-gold/10 group-hover:text-luxury-gold/90"
                                )}>
                                    <FolderKanban className="w-4 h-4 md:w-5 md:h-5" />
                                </div>
                                <span className={cn(
                                    "flex-1 truncate font-medium relative z-10 transition-colors duration-300 text-sm md:text-base",
                                    isCurrent ? "text-luxury-gold" : "text-luxury-text/80 group-hover:text-luxury-text"
                                )}>
                                    {proj.title}
                                </span>
                                {isCurrent && (
                                    <Check className="w-4 h-4 md:w-5 md:h-5 text-luxury-gold flex-shrink-0 relative z-10 drop-shadow-sm" />
                                )}
                            </button>
                        );
                    })}

                    {/* Divider */}
                    <div className="h-px bg-gradient-to-r from-transparent via-luxury-gold/20 to-transparent my-2 mx-4" />

                    {/* New Project Action */}
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            setShowCreateDialog(true);
                        }}
                        className="flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all duration-300 group hover:bg-luxury-gold/10 relative overflow-hidden"
                    >
                        {/* Inner glow on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/5 to-luxury-gold/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        <div className="p-2 rounded-lg bg-luxury-gold/10 flex-shrink-0 relative z-10 group-hover:scale-110 transition-transform duration-300">
                            <FolderKanban className="w-4 h-4 md:w-5 md:h-5 text-luxury-gold" />
                        </div>
                        <span className="flex-1 text-sm md:text-base font-bold text-luxury-gold relative z-10">
                            Nuovo Progetto
                        </span>
                    </button>
                </div>
            )}

            <CreateProjectDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                onProjectCreated={(newProjectId) => {
                    // Cache is invalidated automatically by use-create-project mutation
                    if (onProjectSelect) {
                        onProjectSelect(newProjectId);
                    } else {
                        router.push(`/dashboard/${newProjectId}`);
                    }
                }}
            />
        </div>
    );
}
