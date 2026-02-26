import { MediaAsset } from '@/lib/media-utils';
import { Image as ImageIcon } from 'lucide-react';
import { OptimizedGalleryViewer, GalleryImage } from '@/components/gallery/OptimizedGalleryViewer';

interface AssetGalleryProps {
    assets: MediaAsset[];
    onDelete?: (assetId: string) => void;
}

export function AssetGallery({ assets }: AssetGalleryProps) {
    const galleryImages: GalleryImage[] = assets.map(asset => ({
        id: asset.id,
        url: asset.url,
        thumbnail: asset.thumbnail,
        title: asset.title,
        description: '',
        type: asset.type as 'image' | 'render' | 'video' | 'quote',
        metadata: asset.metadata,
    }));

    if (assets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center border border-luxury-gold/20 rounded-[2.5rem] glass-premium relative overflow-hidden group">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-luxury-teal/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-luxury-teal/20 transition-all duration-700" />

                <div className="p-8 bg-luxury-bg/80 border border-luxury-gold/10 rounded-3xl mb-8 ring-1 ring-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 transition-all duration-700 group-hover:scale-105 group-hover:border-luxury-gold/30">
                    <ImageIcon className="w-12 h-12 text-luxury-gold drop-shadow-[0_0_15px_rgba(233,196,106,0.3)]" />
                </div>

                <h3 className="text-xl md:text-2xl font-bold text-luxury-text mb-3 font-serif relative z-10">
                    Nessun file <span className="text-luxury-gold italic">trovato</span>
                </h3>
                <p className="text-luxury-text/40 max-w-md font-medium text-sm md:text-base leading-relaxed relative z-10">
                    I file generati dalla conversazione appariranno qui.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full h-[70vh]">
            <OptimizedGalleryViewer
                images={galleryImages}
                title="File Progetto"
                enableVirtualization={assets.length > 50}
            />
        </div>
    );
}
