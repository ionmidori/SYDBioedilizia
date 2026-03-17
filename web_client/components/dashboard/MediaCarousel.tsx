import { GalleryAsset } from '@/types/gallery';
import { motion } from 'framer-motion';
import { ArrowRight, Image as ImageIcon, Video, FileText, Receipt, Plus } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useGalleryAssets } from '@/hooks/use-gallery';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export function MediaCarousel() {
    const router = useRouter();
    const { data, isLoading, isError } = useGalleryAssets(10); // Fetch up to 10 recent assets

    // Flatten pages into a single array of assets
    const recentMedia = data?.pages.flatMap(page => page.assets).slice(0, 10) || [];

    if (isLoading) {
        return <LoadingSkeleton />;
    }

    if (isError || recentMedia.length === 0) {
        return <EmptyState onGoToGallery={() => router.push('/dashboard/gallery')} />;
    }

    return (
        <div className="relative w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-luxury-gold/10 border border-luxury-gold/20">
                        <ImageIcon className="w-4 h-4 text-luxury-gold" />
                    </div>
                    <h2 className="text-lg md:text-xl font-serif font-bold text-luxury-text">Media recenti</h2>
                </div>
                <button
                    onClick={() => router.push('/dashboard/gallery')}
                    className="text-[10px] uppercase tracking-wider font-bold text-luxury-gold hover:text-luxury-gold/80 flex items-center gap-1 transition-colors"
                >
                    Tutti <ArrowRight className="w-3 h-3" />
                </button>
            </div>

            {/* Carousel Container */}
            <div
                data-no-swipe
                aria-label="Media recenti"
                ref={(el) => {
                    if (el) {
                        el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                    }
                }}
                className="pb-6 px-1 snap-x snap-mandatory scrollbar-hide w-full"
                style={{
                    display: 'flex',
                    overflowX: 'auto',
                    gap: '1rem',
                    touchAction: 'pan-x pan-y',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehaviorX: 'contain',
                    transform: 'translateZ(0)',
                    willChange: 'transform'
                }}
            >
                {recentMedia.map((asset, index) => (
                    <MediaCard key={asset.id} asset={asset} index={index} />
                ))}

                {/* "View More" Card at the end */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: recentMedia.length * 0.1 }}
                    className="snap-start shrink-0 w-[140px] h-[200px] flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-luxury-text/10 bg-luxury-bg/30 hover:bg-luxury-bg/50 hover:border-luxury-gold/30 transition-all cursor-pointer group"
                    onClick={() => router.push('/dashboard/gallery')}
                >
                    <div className="p-3 rounded-full bg-luxury-text/5 group-hover:bg-luxury-gold/10 transition-colors">
                        <ArrowRight className="w-5 h-5 text-luxury-text/40 group-hover:text-luxury-gold" />
                    </div>
                    <span className="text-xs text-luxury-text/40 font-medium group-hover:text-luxury-text/60">Vedi Tutti</span>
                </motion.div>
            </div>
        </div>
    );
}

function MediaCard({ asset, index }: { asset: GalleryAsset, index: number }) {
    const router = useRouter();

    // Determine standard formatting
    const dateStr = asset.timestamp 
        ? format(new Date(asset.timestamp), "d MMM", { locale: it }) 
        : 'Nuovo';

    // Determine preview icon based on type
    const isImageOrRender = asset.type === 'image' || asset.type === 'render';
    const previewUrl = asset.thumbnail || asset.url; // Use thumbnail if available, else original URL

    const getIcon = () => {
        switch (asset.type) {
            case 'video': return <Video className="w-6 h-6 text-luxury-text/20 group-hover:text-luxury-gold/50 transition-colors" />;
            case 'quote': return <Receipt className="w-6 h-6 text-luxury-text/20 group-hover:text-luxury-gold/50 transition-colors" />;
            default: return <FileText className="w-6 h-6 text-luxury-text/20 group-hover:text-luxury-gold/50 transition-colors" />;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => router.push('/dashboard/gallery')} // Or link to the specific project/asset viewer if implemented
            className="snap-start shrink-0 w-[180px] flex flex-col gap-3 group cursor-pointer"
        >
            {/* Preview Container */}
            <div className="relative aspect-square w-full rounded-[20px] overflow-hidden bg-luxury-bg/50 border border-luxury-text/5 group-hover:border-luxury-gold/30 transition-all">
                {isImageOrRender && previewUrl ? (
                    <Image
                        src={previewUrl}
                        alt={asset.title}
                        fill
                        unoptimized={previewUrl.startsWith('blob:')}
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-luxury-bg/80">
                        {getIcon()}
                    </div>
                )}
                
                {/* Type Badge */}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center">
                    <span className="text-[9px] uppercase font-bold text-white tracking-wider">{asset.type}</span>
                </div>
            </div>

            {/* Info */}
            <div className="px-1 flex flex-col items-start gap-1">
                <h3 className="text-sm font-sans font-semibold text-luxury-text truncate w-full group-hover:text-luxury-gold transition-colors">
                    {asset.title}
                </h3>
                <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] text-luxury-text/40 font-sans truncate pr-2">
                        {asset.metadata?.projectName || 'File'}
                    </span>
                    <span className="text-[10px] text-luxury-gold/70 font-sans shrink-0 uppercase tracking-widest">
                        {dateStr}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="flex gap-4 overflow-hidden py-2">
            {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="shrink-0 w-[180px] h-[220px] rounded-[24px]" />
            ))}
        </div>
    );
}

function EmptyState({ onGoToGallery }: { onGoToGallery: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-8 px-4 rounded-3xl border border-dashed border-luxury-text/10 bg-luxury-bg/20">
            <div className="p-3 rounded-full bg-luxury-gold/5 mb-3">
                <ImageIcon className="w-5 h-5 text-luxury-gold/50" />
            </div>
            <p className="text-luxury-text/60 text-sm mb-4 font-sans text-center">Nessun media recente</p>
            <button
                onClick={onGoToGallery}
                className="flex items-center gap-2 px-5 py-2.5 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold rounded-full text-xs transition-all"
            >
                <Plus className="w-3 h-3" />
                Carica Media
            </button>
        </div>
    );
}
