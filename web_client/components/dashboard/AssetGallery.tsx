import { useState } from 'react';
import Image from 'next/image';
import { MediaAsset } from '@/lib/media-utils';
import { Download, X, FileText, Image as ImageIcon, Video, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

interface AssetGalleryProps {
    assets: MediaAsset[];
    onDelete?: (assetId: string) => void; // Optional callback to update local state
}

export function AssetGallery({ assets, onDelete }: AssetGalleryProps) {
    const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
    const { user } = useAuth();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDownload = async (asset: MediaAsset) => {
        try {
            const response = await fetch(asset.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = asset.title || `asset-${asset.id}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    const handleDelete = async (asset: MediaAsset) => {
        if (!confirm('Sei sicuro di voler eliminare questo file? Questa azione non può essere annullata.')) return;

        setIsDeleting(true);
        try {
            const token = await user?.getIdToken();
            const res = await fetch('/api/assets/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    assetId: asset.id,
                    projectId: asset.metadata?.projectId,
                    url: asset.url
                })
            });

            if (res.ok) {
                setSelectedAsset(null);
                if (onDelete) onDelete(asset.id);
                // Force refresh or optimistic update happens via parent
            } else {
                alert('Errore durante l\'eliminazione');
            }
        } catch (e) {
            console.error(e);
            alert('Errore di connessione');
        } finally {
            setIsDeleting(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'image':
            case 'render':
                return <ImageIcon className="w-6 h-6" />;
            case 'quote':
                return <FileText className="w-6 h-6" />;
            case 'video':
                return <Video className="w-6 h-6" />;
            default:
                return <ImageIcon className="w-6 h-6" />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'image':
                return 'Immagine';
            case 'render':
                return 'Render';
            case 'quote':
                return 'Preventivo';
            case 'video':
                return 'Video';
            default:
                return 'File';
        }
    };

    if (assets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center border border-luxury-gold/20 rounded-[2.5rem] glass-premium relative overflow-hidden group">
                {/* Background Glow */}
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
        <>
            {/* Gallery Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                {assets.map((asset) => (
                    <div key={asset.id} className="flex flex-col gap-2">
                        <div
                            className="group relative aspect-square rounded-2xl overflow-hidden border border-luxury-gold/10 glass-premium hover:border-luxury-gold/40 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] transition-all duration-500 cursor-pointer"
                            onClick={() => setSelectedAsset(asset)}
                        >
                            {/* Asset Preview */}
                            {(asset.type === 'image' || asset.type === 'render') ? (
                                <Image
                                    src={asset.url}
                                    alt={asset.title || ''}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-luxury-bg via-luxury-bg/80 to-luxury-bg/60 text-luxury-gold">
                                    {getIcon(asset.type)}
                                </div>
                            )}

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white font-bold truncate">
                                                {asset.title}
                                            </p>
                                            <p className="text-[10px] text-white/60 uppercase tracking-widest font-extrabold mt-0.5">
                                                {getTypeLabel(asset.type)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Delete Button (Small) */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(asset);
                                                }}
                                                className="p-2 bg-red-500/20 hover:bg-red-500 hover:text-white rounded-xl backdrop-blur-md transition-all duration-300 border border-red-500/30 hover:border-red-500 hover:scale-110"
                                                disabled={isDeleting}
                                            >
                                                <Trash2 className="w-4 h-4 text-red-400 hover:text-white transition-colors" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownload(asset);
                                                }}
                                                className="p-2 bg-luxury-gold/20 hover:bg-luxury-gold hover:text-luxury-bg rounded-xl backdrop-blur-md transition-all duration-300 border border-luxury-gold/30 hover:border-luxury-gold hover:scale-110"
                                            >
                                                <Download className="w-4 h-4 text-luxury-gold hover:text-luxury-bg transition-colors" />
                                            </button>

                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Type Badge - Kept as Overlay Top Right */}
                            <div className="absolute top-3 right-3 z-20">
                                <span className={cn(
                                    "px-3 py-1 rounded-xl text-[9px] font-extrabold uppercase tracking-[0.15em] backdrop-blur-md border shadow-lg",
                                    "bg-luxury-gold/20 text-luxury-gold border-luxury-gold/30"
                                )}>
                                    {getTypeLabel(asset.type)}
                                </span>
                            </div>

                            {/* Hover Shine Effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />
                        </div>

                        {/* Project Name - Moved Below Image */}
                        {asset.metadata?.projectName && (
                            <div className="px-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-luxury-gold/70 block truncate bg-luxury-gold/5 px-2 py-1 rounded-md border border-luxury-gold/10 w-fit max-w-full">
                                    {asset.metadata.projectName}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Lightbox Modal */}
            {selectedAsset && (
                <div
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-luxury-bg/95 backdrop-blur-2xl p-4 sm:p-8 animate-in fade-in duration-300"
                    onClick={() => setSelectedAsset(null)}
                >
                    {/* Close Button - High Z-Index & Better Positioning */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAsset(null);
                        }}
                        className="absolute top-4 right-4 z-[100] p-3 bg-black/20 hover:bg-red-500/20 hover:border-red-500/40 rounded-full backdrop-blur-xl transition-all duration-300 border border-white/10 group shadow-lg hover:scale-110 active:scale-95"
                    >
                        <X className="w-6 h-6 text-white/80 group-hover:text-red-400 transition-colors" />
                    </button>

                    <div
                        className="relative w-full max-w-7xl max-h-full flex flex-col items-center gap-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {(selectedAsset.type === 'image' || selectedAsset.type === 'render') ? (
                            <div className="relative w-full h-[60vh] md:h-[75vh] flex items-center justify-center rounded-3xl overflow-hidden shadow-2xl bg-black/5 ring-1 ring-white/10">
                                <Image
                                    src={selectedAsset.url}
                                    alt={selectedAsset.title || ''}
                                    fill
                                    className="object-contain"
                                    sizes="100vw"
                                    priority
                                />
                            </div>
                        ) : (
                            <div className="w-full h-[50vh] flex items-center justify-center glass-premium rounded-3xl p-8 sm:p-16 text-center border border-luxury-gold/20 shadow-2xl">
                                <div className="flex flex-col items-center">
                                    <div className="p-6 bg-luxury-gold/10 rounded-3xl inline-block mb-6 border border-luxury-gold/20">
                                        {getIcon(selectedAsset.type)}
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-luxury-text mb-3 font-serif">
                                        {selectedAsset.title}
                                    </h3>
                                    <p className="text-luxury-text/60 mb-8 font-medium uppercase tracking-widest text-sm">
                                        {getTypeLabel(selectedAsset.type)}
                                    </p>
                                    <Button
                                        onClick={() => handleDownload(selectedAsset)}
                                        className="h-12 px-8 bg-luxury-gold hover:bg-luxury-gold text-luxury-bg font-extrabold hover:scale-105 transition-all shadow-2xl shadow-luxury-gold/20 rounded-2xl uppercase tracking-[0.2em] text-xs"
                                    >
                                        <Download className="w-5 h-5 mr-3" />
                                        Scarica File
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Info Panel - Optimized for Mobile/Desktop */}
                        <div className="w-full max-w-4xl shrink-0 glass-premium backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-luxury-gold/10 shadow-xl">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                                <div className="min-w-0 w-full sm:w-auto">
                                    <h4 className="text-luxury-text font-bold text-lg tracking-tight truncate px-1">
                                        {selectedAsset.title}
                                    </h4>
                                    <p className="text-sm text-luxury-text/50 font-medium uppercase tracking-widest mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                        {getTypeLabel(selectedAsset.type)}
                                        {selectedAsset.metadata?.projectName && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-luxury-gold/50 hidden sm:block" />
                                                <span className="text-luxury-gold font-bold">{selectedAsset.metadata.projectName}</span>
                                            </>
                                        )}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
                                    {/* Link to Project */}
                                    {selectedAsset.metadata?.projectId && (
                                        <Button
                                            onClick={() => window.location.href = `/dashboard/${selectedAsset.metadata?.projectId}`}
                                            className="h-10 px-4 bg-white/5 hover:bg-white/10 text-luxury-text font-bold border border-white/10 rounded-xl text-xs sm:text-sm"
                                        >
                                            Progetto
                                        </Button>
                                    )}

                                    {/* DELETE BUTTON */}
                                    <Button
                                        onClick={() => handleDelete(selectedAsset)}
                                        disabled={isDeleting}
                                        variant="ghost"
                                        className="h-10 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-xl hover:text-red-300"
                                    >
                                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                                        <span className="hidden sm:inline">{isDeleting ? 'Eliminazione...' : 'Elimina'}</span>
                                        <span className="sm:hidden">Elimina</span>
                                    </Button>

                                    <Button
                                        onClick={() => handleDownload(selectedAsset)}
                                        className="h-10 px-6 bg-luxury-gold hover:bg-luxury-gold text-luxury-bg font-extrabold hover:scale-105 transition-all shadow-xl shadow-luxury-gold/20 rounded-xl uppercase tracking-widest text-xs"
                                    >
                                        <Download className="w-4 h-4 sm:mr-2" />
                                        <span className="hidden sm:inline">Scarica</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
