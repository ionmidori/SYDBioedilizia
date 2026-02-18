"use client";

import { useState } from 'react';
import { ProjectListItem, ProjectStatus } from '@/types/projects';
import { useRouter } from 'next/navigation';
import { Calendar, MessageSquare, ImageIcon, Trash2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { RenameProjectDialog } from './RenameProjectDialog';
import { projectsApi } from '@/lib/projects-api';
import { ComparisonThumbnail } from './ComparisonThumbnail';
import { motion } from 'framer-motion';

interface ProjectCardProps {
    project: ProjectListItem;
    index?: number;
    onDelete?: (sessionId: string) => void;
}

const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
    draft: { label: 'Bozza', color: 'text-slate-300', bg: 'bg-slate-500/15' },
    analyzing: { label: 'In Analisi', color: 'text-sky-300', bg: 'bg-sky-500/15' },
    quoted: { label: 'Preventivato', color: 'text-amber-300', bg: 'bg-amber-500/15' },
    rendering: { label: 'Rendering', color: 'text-violet-300', bg: 'bg-violet-500/15' },
    completed: { label: 'Completato', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
};

export function ProjectCard({ project, index, onDelete }: ProjectCardProps) {
    const router = useRouter();
    const status = statusConfig[project.status] || statusConfig.draft;
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);

    const handleCardClick = () => {
        router.push(`/dashboard/${project.session_id}`);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteDialogOpen(true);
    };

    const handleRenameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRenameDialogOpen(true);
    };

    const handleDelete = async (sessionId: string) => {
        await projectsApi.deleteProject(sessionId);
        onDelete?.(sessionId);
    };

    const formattedDate = new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(project.updated_at));

    return (
        <motion.div
            onClick={handleCardClick}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            whileHover={{
                y: -5,
                boxShadow: '0 12px 32px -8px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(233, 196, 106, 0.15), 0 0 20px rgba(233, 196, 106, 0.08)',
                transition: { duration: 0.3, ease: [0.05, 0.7, 0.1, 1.0] }
            }}
            transition={{
                duration: 0.6,
                delay: index ? index * 0.05 : 0,
                ease: [0.05, 0.7, 0.1, 1.0]
            }}
            className="group relative flex flex-col gap-3 p-5 rounded-[24px] surface-container-low hover:surface-container-high hover:shadow-elevation-high transition-all duration-500 cursor-pointer overflow-hidden"
        >
            {/* Cinematic Gradient Sweep (on hover) */}
            <div className="absolute inset-0 bg-gradient-to-tr from-luxury-teal/0 via-luxury-teal/5 to-luxury-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            {/* Status Badge */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <span className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-luxury-gold/20 backdrop-blur-xl shadow-sm",
                    status.color,
                    "bg-luxury-bg/60"
                )}
                >
                    {status.label}
                </span>

                {/* Edit Button */}
                <button
                    onClick={handleRenameClick}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-300 w-8 h-8 rounded-full bg-white/10 hover:bg-luxury-gold/20 border border-white/10 hover:border-luxury-gold/40 flex items-center justify-center text-white hover:text-luxury-gold hover:scale-110 active:scale-90"
                    title="Rinomina progetto"
                >
                    <Edit2 className="w-3.5 h-3.5" />
                </button>

                {/* Delete Button */}
                <button
                    onClick={handleDeleteClick}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-300 w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 flex items-center justify-center text-red-400 hover:text-red-300 hover:scale-110 active:scale-90"
                    title="Elimina progetto"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Thumbnail */}
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-luxury-bg border border-luxury-gold/10 group-hover:border-luxury-gold/20 transition-all duration-500">
                {project.thumbnail_url && project.original_image_url ? (
                    <div className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                        <ComparisonThumbnail
                            beforeImage={project.original_image_url}
                            afterImage={project.thumbnail_url}
                            alt={project.title}
                        />
                    </div>
                ) : project.thumbnail_url ? (
                    <Image
                        src={project.thumbnail_url}
                        alt={project.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-luxury-text opacity-20 group-hover:opacity-40 transition-opacity">
                        <ImageIcon className="w-10 h-10" />
                    </div>
                )}

                {/* Hover Action Overlay */}
                <div className="absolute inset-0 bg-luxury-bg/40 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center backdrop-blur-[1px] pointer-events-none">
                    <div className="px-5 py-2.5 bg-luxury-teal/20 text-luxury-text rounded-full text-xs font-bold tracking-widest uppercase backdrop-blur-xl border border-luxury-teal/40 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 shadow-xl">
                        Apri Progetto
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-2 relative">
                <h3 className="text-lg font-bold text-luxury-text group-hover:text-luxury-gold transition-colors truncate font-serif">
                    {project.title}
                </h3>

                <div className="flex items-center justify-between text-[11px] text-luxury-text/50 font-medium tracking-tight">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/5">
                        <Calendar className="w-3 h-3 text-luxury-gold" />
                        <span suppressHydrationWarning>{formattedDate}</span>
                    </div>
                    {project.message_count > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-luxury-teal/5 border border-luxury-teal/10">
                            <MessageSquare className="w-3 h-3 text-luxury-teal" />
                            <span>{project.message_count} {project.message_count === 1 ? 'msg' : 'msg'}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <DeleteProjectDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                projectTitle={project.title}
                sessionId={project.session_id}
                onDelete={handleDelete}
            />

            <RenameProjectDialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
                currentTitle={project.title}
                sessionId={project.session_id}
                onRename={() => onDelete?.(project.session_id)} // Trigger refresh (using onDelete as refresh callback for now)
            />
        </motion.div>
    );
}
