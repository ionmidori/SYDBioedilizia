'use client';

import { useProjects } from '@/hooks/useProjects';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/hooks/useAuth';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { QuickActionsRow } from '@/components/dashboard/QuickActionsRow';
import { ProjectsCarousel } from '@/components/dashboard/ProjectsCarousel';
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog';
import { FolderKanban, FileText, Image, LayoutGrid, Plus, Upload, MessageSquare, Receipt, Ruler } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createStaggerVariants, M3Spring } from '@/lib/m3-motion';

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

    const userName = user?.displayName?.split(' ')[0] || 'Utente';

    // M3 Stagger variants for dashboard sections
    const { container: sectionStagger, item: sectionItem } = useMemo(
        () => createStaggerVariants({ y: 20 }),
        [],
    );

    return (
        <motion.div
            className="flex flex-col space-y-8 py-6 px-4 md:px-8 max-w-[1600px] mx-auto w-full pb-32 md:pb-8 overflow-x-hidden overflow-y-visible"
            variants={sectionStagger}
            initial="hidden"
            animate="visible"
        >
            {/* Header Section */}
            <header className="flex items-center justify-between">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={M3Spring.gentle}
                    className="space-y-1"
                >
                    <h1 className="text-3xl md:text-4xl font-serif font-bold text-luxury-text tracking-tight">
                        {greeting}, <br className="md:hidden" />
                        <span className="text-luxury-gold italic">{userName}</span>
                    </h1>
                    <p className="text-luxury-text/50 font-sans text-sm md:text-base">
                        Panoramica attività
                    </p>
                </motion.div>

                {/* User Avatar (Placeholder for now, could be passed from Auth) */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={M3Spring.bouncy}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold font-serif font-bold text-lg md:text-xl shrink-0"
                >
                    {userName.charAt(0)}
                </motion.div>
            </header>

            {/* Error State */}
            {error && (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400">
                    <p className="flex items-center gap-2 font-semibold text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Errore: {error}
                    </p>
                </div>
            )}

            {/* 1. KPI Stats Grid (2x2) */}
            <motion.section variants={sectionItem}>
                <StatsGrid
                    isLoading={statsLoading}
                    stats={[
                        { label: 'Progetti Attivi', value: stats.activeProjects, icon: FolderKanban },
                        { label: 'File Totali', value: stats.totalFiles, icon: FileText },
                        { label: 'Renders', value: stats.totalRenders, icon: Image },
                        { label: 'Preventivi Creati', value: 0, icon: Receipt },
                    ]}
                />
            </motion.section>

            {/* 2. Quick Actions (Horizontal Row) */}
            <motion.section variants={sectionItem}>
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
                            label: 'Galleria',
                            icon: LayoutGrid,
                            onClick: () => router.push('/dashboard/gallery')
                        },
                        {
                            label: 'Chat AI',
                            icon: MessageSquare,
                            onClick: () => {
                                if (recentProjects[0]) {
                                    router.push(`/dashboard/${recentProjects[0].session_id}`);
                                } else {
                                    handleCreateProject();
                                }
                            }
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
            <motion.section variants={sectionItem}>
                <ProjectsCarousel
                    projects={recentProjects}
                    isLoading={projectsLoading}
                    onCreateNew={handleCreateProject}
                />
            </motion.section>

            <CreateProjectDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
            />
        </motion.div>
    );
}
