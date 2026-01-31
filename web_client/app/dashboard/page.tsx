'use client';

import { useProjects } from '@/hooks/useProjects';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/hooks/useAuth';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { QuickActionCard } from '@/components/dashboard/QuickActionCard';
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog';
import { Plus, Loader2, FolderKanban, FileText, Image, Upload, LayoutGrid, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

export default function DashboardPage() {
    const { user } = useAuth();
    const { projects, loading: projectsLoading, error, refresh } = useProjects();
    const { stats, loading: statsLoading } = useDashboardStats();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const router = useRouter();

    const handleCreateProject = () => {
        setCreateDialogOpen(true);
    };

    const handleDeleteProject = () => {
        refresh();
    };

    // Get recent projects (last 3 modified)
    const recentProjects = useMemo(() => {
        return [...projects]
            .sort((a, b) => {
                const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return dateB - dateA;
            })
            .slice(0, 3);
    }, [projects]);

    // Personalized greeting
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buongiorno';
        if (hour < 18) return 'Buon pomeriggio';
        return 'Buonasera';
    }, []);

    const userName = user?.displayName?.split(' ')[0] || 'Utente';

    return (
        <div className="flex flex-col space-y-8 py-6 px-4 md:px-8 max-w-[1600px] mx-auto w-full">
            {/* Hero Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
            >
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-luxury-text font-serif">
                    {greeting}, <span className="text-luxury-gold italic">{userName}</span>
                </h1>
                <p className="text-luxury-text/50 font-medium text-sm md:text-base">
                    Ecco una panoramica dei tuoi progetti di ristrutturazione
                </p>
            </motion.div>

            {/* Error State */}
            {error && (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400">
                    <p className="flex items-center gap-2 font-semibold text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Errore: {error}
                    </p>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <StatCard
                    icon={FolderKanban}
                    label="Progetti Attivi"
                    value={stats.totalProjects}
                    isLoading={statsLoading}
                />
                <StatCard
                    icon={FileText}
                    label="File Caricati"
                    value={stats.totalFiles}
                    isLoading={statsLoading}
                />
                <StatCard
                    icon={Image}
                    label="Render Generati"
                    value={stats.totalRenders}
                    isLoading={statsLoading}
                />
                <StatCard
                    icon={LayoutGrid}
                    label="Galleria"
                    value={`${stats.totalFiles + stats.totalRenders}`}
                    isLoading={statsLoading}
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                {/* Recent Projects - Left 2/3 */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-luxury-text font-serif">
                                Progetti Recenti
                            </h2>
                            <p className="text-sm text-luxury-text/50 mt-1">
                                Ultimi 3 progetti modificati
                            </p>
                        </div>
                        <button
                            onClick={() => router.push('/dashboard/projects')}
                            className="text-sm text-luxury-gold hover:text-luxury-gold/80 font-medium transition-colors"
                        >
                            Vedi tutti →
                        </button>
                    </div>

                    {projectsLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-[280px] rounded-2xl bg-white/5 border border-white/5 animate-pulse" />
                            ))}
                        </div>
                    ) : recentProjects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 rounded-2xl border border-luxury-gold/10 bg-luxury-bg/50">
                            <div className="p-4 rounded-full bg-luxury-gold/5 mb-4">
                                <FolderKanban className="w-8 h-8 text-luxury-gold/30" />
                            </div>
                            <p className="text-luxury-text/40 text-sm mb-4">Nessun progetto ancora</p>
                            <button
                                onClick={handleCreateProject}
                                className="flex items-center gap-2 px-6 py-3 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-xl transition-all hover:scale-105"
                            >
                                <Plus className="w-4 h-4" />
                                Crea Primo Progetto
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {recentProjects.map((project) => (
                                <ProjectCard
                                    key={project.session_id}
                                    project={project}
                                    onDelete={handleDeleteProject}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Activity Feed - Right 1/3 */}
                <div className="lg:col-span-1">
                    <ActivityFeed
                        activities={stats.recentActivity}
                        isLoading={statsLoading}
                        maxItems={8}
                    />
                </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-bold text-luxury-text font-serif">
                        Azioni Rapide
                    </h2>
                    <p className="text-sm text-luxury-text/50 mt-1">
                        Accesso veloce alle funzionalità più usate
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <QuickActionCard
                        icon={Plus}
                        label="Nuovo Progetto"
                        description="Avvia una nuova ristrutturazione"
                        onClick={handleCreateProject}
                    />
                    <QuickActionCard
                        icon={Upload}
                        label="Carica File"
                        description="Aggiungi documenti o immagini"
                        onClick={() => router.push('/dashboard/gallery')}
                    />
                    <QuickActionCard
                        icon={LayoutGrid}
                        label="Galleria Globale"
                        description="Tutti i tuoi file in un posto"
                        onClick={() => router.push('/dashboard/gallery')}
                    />
                    <QuickActionCard
                        icon={MessageSquare}
                        label="Chat con SYD"
                        description="Chiedi supporto all'AI"
                        onClick={() => {
                            if (recentProjects[0]) {
                                router.push(`/dashboard/${recentProjects[0].session_id}`);
                            } else {
                                handleCreateProject();
                            }
                        }}
                    />
                </div>
            </div>

            <CreateProjectDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
            />
        </div>
    );
}
