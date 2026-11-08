'use client';

import { useState } from 'react';
import { MediaAsset } from '@/lib/media-utils';
import { Image as ImageIcon } from 'lucide-react';
import { OptimizedGalleryViewer, GalleryImage } from '@/components/gallery/OptimizedGalleryViewer';
import { DeleteAssetDialog } from './DeleteAssetDialog';
import { fetchWithAuth } from '@/lib/api-client';

interface AssetGalleryProps {
    assets: MediaAsset[];
    onDelete?: (assetId: string) => void;
}

export function AssetGallery({ assets, onDelete }: AssetGalleryProps) {
    const [assetToDelete, setAssetToDelete] = useState<GalleryImage | null>(null);

    const galleryImages: GalleryImage[] = assets.map(asset => ({
        id: asset.id,
        url: asset.url,
        thumbnail: asset.thumbnail,
        title: asset.title,
        description: '',
        type: asset.type as 'image' | 'render' | 'video' | 'quote',
        metadata: asset.metadata,
    }));

    const handleDeleteConfirm = async () => {
        if (!assetToDelete) return;
        const projectId = assetToDelete.metadata?.projectId;
        if (!projectId) {
            console.error('[AssetGallery] Cannot delete: missing projectId in asset metadata');
            setAssetToDelete(null);
            return;
        }
        try {
            // Delegates to Python backend — auth (JWT + AppCheck) injected by fetchWithAuth
            const res = await fetchWithAuth(
                `/api/py/projects/${projectId}/files/${assetToDelete.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                if (onDelete) onDelete(assetToDelete.id);
            } else {
                console.error('[AssetGallery] Failed to delete asset:', res.status);
            }
        } catch (e) {
            console.error('[AssetGallery] Delete error:', e);
        } finally {
            setAssetToDelete(null);
        }
    };

    if (assets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center border border-line rounded-[2.5rem] glass relative overflow-hidden group">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary-subtle rounded-full blur-[80px] pointer-events-none group-hover:bg-primary-subtle transition-all duration-700" />

                <div className="p-8 bg-canvas/80 border border-line rounded-3xl mb-8 ring-1 ring-line shadow-[0_20px_50px_color-mix(in_oklab,var(--color-shade)_50%,transparent)] relative z-10 transition-all duration-700 group-hover:scale-105 group-hover:border-line">
                    <ImageIcon className="w-12 h-12 text-accent-ink drop-shadow-[0_0_15px_color-mix(in_oklab,var(--color-accent)_30%,transparent)]" />
                </div>

                <h3 className="text-xl md:text-2xl font-bold text-ink mb-3 font-serif relative z-10">
                    Nessun file <span className="text-accent-ink italic">trovato</span>
                </h3>
                <p className="text-ink-subtle max-w-md font-medium text-sm md:text-base leading-relaxed relative z-10">
                    I file generati dalla conversazione appariranno qui.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 w-full relative">
            <OptimizedGalleryViewer
                images={galleryImages}
                title="Media della casa"
                enableVirtualization={assets.length > 50}
                onDeleteClick={(image) => setAssetToDelete(image)}
            />

            <DeleteAssetDialog
                open={!!assetToDelete}
                onOpenChange={(open) => !open && setAssetToDelete(null)}
                assetTitle={assetToDelete?.title || 'questo file'}
                onDelete={handleDeleteConfirm}
            />
        </div>
    );
}
