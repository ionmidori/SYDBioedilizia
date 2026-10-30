'use client';

import { useProjects } from '@/hooks/use-projects';
import { describeApiError } from '@/lib/api-client';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/hooks/useAuth';
import { useChatContext } from '@/hooks/useChatContext';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { QuickActionsRow } from '@/components/dashboard/QuickActionsRow';
import { ProjectsCarousel } from '@/components/dashboard/ProjectsCarousel';
import { EmptyProjectsState } from '@/components/dashboard/EmptyProjectsState';
import { MediaCarousel } from '@/components/dashboard/MediaCarousel';
import { FolderKanban, FileText, Image as ImageIcon, Upload, Receipt, Ruler, Calculator, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { createStaggerVariants, M3Spring } from '@/lib/m3-motion';

export default function DashboardPage() {
    const { user } = useAuth();
    const { data: projects = [], isLoading: projectsLoading, isError, error: queryError } = useProjects();
    const error = isError ? describeApiError(queryError) : null;
    const { stats, loading: statsLoading } = useDashboardStats();
    const { userChatId } = useChatContext();
    const router = useRouter();

    // The user's one chat (Phase 139), optionally with an intent. Its id comes
    // from the backend within moments of the page loading; until then nothing.
    const openChatWith = (intent?: 'quote' | 'render' | 'cad') => {
        if (!userChatId) return;
        router.push(intent ? `/dashboard/${userChatId}?intent=${intent}` : `/dashboard/${userChatId}`);
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
            className="bento-grid py-4 px-3 md:px-12 w-full pb-12 md:pb-8"
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
                <p className="text-luxury-text/50 font-sans text-xs md:text-sm max-w-2xl leading-relaxed">
                    Benvenuto nella tua centrale di controllo SYD. Da qui puoi monitorare lo stato dei tuoi cantieri,
                    caricare nuovi documenti tecnici, generare render fotorealistici con l&apos;IA e accedere
                    rapidamente ai tuoi progetti recenti dal carosello in basso.
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
                        { label: 'Renders', value: stats.totalRenders, icon: ImageIcon },
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
                            label: 'Carica File',
                            description: 'Gestisci i tuoi documenti',
                            icon: Upload,
                            onClick: () => router.push('/dashboard/gallery'),
                            highlight: true
                        },
                        {
                            label: 'Crea Preventivo',
                            description: 'Genera preventivo col Cantiere AI',
                            icon: Calculator,
                            onClick: () => openChatWith('quote'),
                            highlight: true
                        },
                        {
                            label: 'Crea Rendering',
                            description: 'Render architettonico via AI',
                            icon: Wand2,
                            onClick: () => openChatWith('render'),
                            highlight: true
                        },
                        {
                            label: 'Rilievo CAD',
                            description: 'Inizia la progettazione tecnica',
                            icon: Ruler,
                            onClick: () => openChatWith('cad'),
                            highlight: true
                        }
                    ]}
                />
            </motion.section>

            {/* 3. Recent Projects (Carousel) */}
            <motion.section variants={sectionItem} style={{ gridArea: 'projects' }} className="min-w-0 overflow-hidden">
                {!projectsLoading && projects.length === 0 ? (
                    <EmptyProjectsState onOpenChat={() => openChatWith()} />
                ) : (
                    <ProjectsCarousel
                        projects={recentProjects}
                        isLoading={projectsLoading}
                    />
                )}
            </motion.section>

            {/* 4. Recent Media (Carousel) */}
            <motion.section variants={sectionItem} style={{ gridArea: 'media' }} className="min-w-0 overflow-hidden">
                <MediaCarousel />
            </motion.section>
        </motion.div>
    );
}
