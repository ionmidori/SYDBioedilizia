'use client';

import { useProjects } from '@/hooks/useProjects';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/hooks/useAuth';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { QuickActionsRow } from '@/components/dashboard/QuickActionsRow';
import { ProjectsCarousel } from '@/components/dashboard/ProjectsCarousel';
import { EmptyProjectsState } from '@/components/dashboard/EmptyProjectsState';
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog';
import { FolderKanban, FileText, Image, Plus, Upload, Receipt, Ruler } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createStaggerVariants, M3Spring } from '@/lib/m3-motion';
import { DebugLayout } from "@/components/DebugLayout";

export default function DashboardPage() {
    const { user } = useAuth();
    const { projects, loading: projectsLoading, error, refresh } = useProjects();
    const { stats, loading: statsLoading } = useDashboardStats();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const router = useRouter();

    const handleCreateProject = () => {
        setCreateDialogOpen(true);
    };

    // Get recent projects (last 6 modified)
    const recentProjects = useMemo(() => {
        return [...projects]
            .sort((a, b) => {
                const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return dateB - dateA;
            })
            .slice(0, 6);
    }, [projects]);

    // Personalized greeting
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buongiorno';
        if (hour < 18) return 'Buon pomeriggio';
        return 'Buonasera';
    }, []);

    // Formatted date: "14 FEB · VENERDÌ"
    const formattedDate = useMemo(() => {
        const now = new Date();
        const day = now.getDate();
        const month = now.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase().replace('.', '');
        const weekday = now.toLocaleDateString('it-IT', { weekday: 'long' }).toUpperCase();
        return `${day} ${month} · ${weekday}`;
    }, []);

    const userName = user?.displayName?.split(' ')[0] || 'Utente';

    // M3 Stagger variants for dashboard sections
    const { container: sectionStagger, item: sectionItem } = useMemo(
        () => createStaggerVariants({ y: 20 }),
        [],
    );

    return (
        <motion.div
            className="bento-grid py-4 px-3 md:px-8 max-w-7xl mx-auto w-full pb-32 md:pb-8"
            variants={sectionStagger}
            initial="hidden"
            animate="visible"
        >
            {/* Welcome Hero */}
            <motion.header
                className="space-y-1"
                style={{ gridArea: 'hero' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={M3Spring.gentle}
            >
                <p className="text-[10px] font-sans uppercase tracking-widest text-luxury-gold/60 font-medium">
                    {formattedDate}
                </p>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-luxury-text tracking-tight leading-tight">
                    {greeting}, <br className="md:hidden" />
                    <span className="text-luxury-gold italic">{userName}</span>
                </h1>
                <p className="text-luxury-text/40 font-sans text-xs md:text-sm">
                    La tua bacheca operativa
                </p>
            </motion.header>

            {/* Error State */}
            {error && (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400" style={{ gridArea: 'hero' }}>
                    <p className="flex items-center gap-2 font-semibold text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Errore: {error}
                    </p>
                </div>
            )}

            {/* 1. KPI Stats Grid (2x2) */}
            <div style={{ gridArea: 'stats' }} className="w-full relative z-10 min-w-0">
                <StatsGrid
                    isLoading={statsLoading}
                    stats={[
                        { label: 'Progetti', value: stats.activeProjects, icon: FolderKanban },
                        { label: 'Files', value: stats.totalFiles, icon: FileText },
                        { label: 'Renders', value: stats.totalRenders, icon: Image },
                        { label: 'Preventivi', value: 0, icon: Receipt },
                    ]}
                />
            </div>

            {/* 2. Quick Actions (Surface Cards) */}
            <motion.section variants={sectionItem} style={{ gridArea: 'actions' }} className="min-w-0 overflow-hidden">
                <h3 className="sr-only">Azioni Rapide</h3>
                <QuickActionsRow
                    actions={[
                        {
                            label: 'Nuovo Progetto',
                            icon: Plus,
                            onClick: handleCreateProject,
                            highlight: true
                        },
                        {
                            label: 'Carica File',
                            icon: Upload,
                            onClick: () => router.push('/dashboard/gallery')
                        },
                        {
                            label: 'Rilievo CAD',
                            icon: Ruler,
                            onClick: () => {
                                if (recentProjects[0]) {
                                    router.push(`/dashboard/${recentProjects[0].session_id}?intent=cad`);
                                } else {
                                    handleCreateProject();
                                }
                            }
                        }
                    ]}
                />
            </motion.section>

            {/* 3. Recent Projects (Carousel) */}
            <motion.section variants={sectionItem} style={{ gridArea: 'projects' }} className="min-w-0 overflow-hidden">
                {!projectsLoading && projects.length === 0 ? (
                    <EmptyProjectsState onCreate={handleCreateProject} />
                ) : (
                    <ProjectsCarousel
                        projects={recentProjects}
                        isLoading={projectsLoading}
                        onCreateNew={handleCreateProject}
                    />
                )}
            </motion.section>

            <CreateProjectDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
            />
        </motion.div>
    );
}
