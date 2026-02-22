import { ProjectListItem } from '@/types/projects';
import { motion } from 'framer-motion';
import { Calendar, ArrowRight, FolderKanban, Plus } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface ProjectsCarouselProps {
    projects: ProjectListItem[];
    isLoading: boolean;
    onCreateNew: () => void;
}

export function ProjectsCarousel({ projects, isLoading, onCreateNew }: ProjectsCarouselProps) {
    const router = useRouter();

    if (isLoading) {
        return <LoadingSkeleton />;
    }

    if (projects.length === 0) {
        return <EmptyState onCreateNew={onCreateNew} />;
    }

    return (
        <div className="relative w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-luxury-gold/10 border border-luxury-gold/20">
                        <FolderKanban className="w-4 h-4 text-luxury-gold" />
                    </div>
                    <h2 className="text-lg md:text-xl font-serif font-bold text-luxury-text">I Miei Progetti</h2>
                </div>
                <button
                    onClick={() => router.push('/dashboard/projects')}
                    className="text-[10px] uppercase tracking-wider font-bold text-luxury-gold hover:text-luxury-gold/80 flex items-center gap-1 transition-colors"
                >
                    Archivio <ArrowRight className="w-3 h-3" />
                </button>
            </div>

            {/* Carousel Container */}
            <div
                data-no-swipe
                aria-label="Progetti recenti"
                ref={(el) => {
                    if (el) {
                        el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                        el.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
                    }
                }}
                className="pb-6 px-1 snap-x snap-mandatory scrollbar-hide w-full"
                style={{
                    display: 'flex',
                    overflowX: 'auto',
                    gap: '1rem',
                    touchAction: 'pan-x',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehaviorX: 'contain',
                    transform: 'translateZ(0)',
                    willChange: 'transform'
                }}
            >
                {projects.map((project, index) => (
                    <ProjectCard key={project.session_id} project={project} index={index} />
                ))}

                {/* "View More" Card at the end */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: projects.length * 0.1 }}
                    className="snap-start shrink-0 w-[140px] h-[200px] flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-luxury-text/10 bg-luxury-bg/30 hover:bg-luxury-bg/50 hover:border-luxury-gold/30 transition-all cursor-pointer group"
                    onClick={() => router.push('/dashboard/projects')}
                >
                    <div className="p-3 rounded-full bg-luxury-text/5 group-hover:bg-luxury-gold/10 transition-colors">
                        <ArrowRight className="w-5 h-5 text-luxury-text/40 group-hover:text-luxury-gold" />
                    </div>
                    <span className="text-xs text-luxury-text/40 font-medium group-hover:text-luxury-text/60">Vedi Archivio</span>
                </motion.div>
            </div>
        </div>
    );
}

function ProjectCard({ project, index }: { project: ProjectListItem, index: number }) {
    const router = useRouter();

    // Formatting date safely
    const date = project.updated_at
        ? new Date(project.updated_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
        : 'Nuovo';

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => router.push(`/dashboard/${project.session_id}`)}
            className="snap-start shrink-0 w-[220px] flex flex-col gap-3 group cursor-pointer"
        >
            {/* Image Container */}
            <div className="relative aspect-[3/2] w-full rounded-[20px] overflow-hidden bg-luxury-bg/50 border border-luxury-text/5 group-hover:border-luxury-gold/30 transition-all">
                {project.thumbnail_url ? (
                    <Image
                        src={project.thumbnail_url}
                        alt={project.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-luxury-bg/80">
                        <FolderKanban className="w-6 h-6 text-luxury-text/20 group-hover:text-luxury-gold/50 transition-colors" />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="px-1">
                <h3 className="text-sm font-serif font-bold text-luxury-text truncate group-hover:text-luxury-gold transition-colors">
                    {project.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-3 h-3 text-luxury-text/40" />
                    <span className="text-xs text-luxury-text/40 font-sans">{date}</span>
                </div>
            </div>
        </motion.div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="flex gap-4 overflow-hidden py-2">
            {[1, 2, 3].map((i) => (
                <div key={i} className="shrink-0 w-[260px] h-[240px] rounded-[24px] bg-luxury-text/5 animate-pulse" />
            ))}
        </div>
    );
}

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 px-4 rounded-3xl border border-dashed border-luxury-text/10 bg-luxury-bg/20">
            <div className="p-4 rounded-full bg-luxury-gold/5 mb-3">
                <FolderKanban className="w-6 h-6 text-luxury-gold/50" />
            </div>
            <p className="text-luxury-text/60 text-sm mb-4 font-sans text-center">Nessun progetto recente</p>
            <button
                onClick={onCreateNew}
                className="flex items-center gap-2 px-5 py-2.5 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-full text-sm transition-all"
            >
                <Plus className="w-4 h-4" />
                Crea Progetto
            </button>
        </div>
    );
}
