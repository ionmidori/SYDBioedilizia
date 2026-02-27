"use client";

import { useEffect, useState } from 'react';
import { AssetGallery } from '@/components/dashboard/AssetGallery';
import { FileUploader } from '@/components/dashboard/FileUploader';
import { extractMediaFromMessages, groupAssetsByType, MediaAsset } from '@/lib/media-utils';
import { Loader2, FileImage, Upload, X, AlertCircle } from 'lucide-react';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useAuth } from '@/hooks/useAuth';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils'; // Assuming cn utility exists

interface ProjectFilesViewProps {
    projectId: string;
}

export function ProjectFilesView({ projectId }: ProjectFilesViewProps) {
    const { user, loading: authLoading } = useAuth();
    const { historyLoaded, historyMessages } = useChatHistory(projectId);
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [selectedFilter, setSelectedFilter] = useState<string>('all');
    const [showUploader, setShowUploader] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initial load from chat history
    useEffect(() => {
        if (historyLoaded && historyMessages.length > 0) {
            const extractedAssets = extractMediaFromMessages(historyMessages);
            
            const timerId = setTimeout(() => {
                setAssets(prev => {
                    let changed = false;
                    const uniqueAssets = [...prev];
                    extractedAssets.forEach(newAsset => {
                        if (!uniqueAssets.some(a => a.id === newAsset.id)) {
                            uniqueAssets.push(newAsset);
                            changed = true;
                        }
                    });
                    return changed ? uniqueAssets : prev;
                });
            }, 0);

            return () => clearTimeout(timerId);
        }
    }, [historyLoaded, historyMessages]);

    // Real-time subscription to project files
    // ADR-001: Documented onSnapshot exception. Data is project-owned and read-only here.
    // All writes go through the backend API (FileUploader → /api/upload).
    // See: docs/ADR/ADR-001-realtime-onSnapshot-vs-SSE.md
    useEffect(() => {
        // ADR-001: Added explicit null-checks for guest sessions to prevent persistence/permission errors.
        if (!projectId || !db || authLoading || !user) return;

        const q = query(
            collection(db, 'projects', projectId, 'files'),
            orderBy('uploadedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            // Guardrail: For collection listeners, snapshot itself is never null, 
            // but we check if it contains docs. empty is the collection equivalent of !exists()
            const uploadedFiles = snapshot.docs.map((doc: any) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: data.type === 'document' ? 'quote' : data.type,
                    url: data.url,
                    thumbnail: data.type === 'image' ? data.url : undefined,
                    title: data.name,
                    createdAt: data.uploadedAt?.toDate() || new Date(),
                    timestamp: data.uploadedAt?.toDate() || new Date(),
                    metadata: {
                        size: data.size,
                        uploadedBy: data.uploadedBy
                    }
                } as MediaAsset;
            });

            setAssets(prev => {
                const uniqueAssets = [...prev];
                const filtered = uniqueAssets.filter(a => !uploadedFiles.some((u: MediaAsset) => u.id === a.id));
                return [...uploadedFiles, ...filtered].sort((a: any, b: any) => {
                    const timeA = a.createdAt?.getTime ? a.createdAt.getTime() : new Date(a.timestamp).getTime();
                    const timeB = b.createdAt?.getTime ? b.createdAt.getTime() : new Date(b.timestamp).getTime();
                    return timeB - timeA;
                });
            });
            setError(null);
        },
            (error) => {
                // ADR-001 compliance: explicit error handling per hardened onSnapshot pattern
                console.error('[ProjectFilesView] onSnapshot error:', error.code, error.message);
                if (error.code === 'permission-denied') {
                    setError('Non hai i permessi per visualizzare i file di questo progetto.');
                } else {
                    setError('Errore durante l\'aggiornamento dei file in tempo reale.');
                }
            });

        return () => unsubscribe();
    }, [projectId, user, authLoading]);

    const groupedAssets = groupAssetsByType(assets);
    const filteredAssets = selectedFilter === 'all'
        ? assets
        : groupedAssets[selectedFilter] || [];

    const filterOptions = [
        { value: 'all', label: 'Tutti', count: assets.length },
        { value: 'image', label: 'Immagini', count: groupedAssets.image?.length || 0 },
        { value: 'render', label: 'Render', count: groupedAssets.render?.length || 0 },
        { value: 'quote', label: 'Preventivi', count: groupedAssets.quote?.length || 0 },
    ];

    if (!historyLoaded) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-700">
                <Loader2 className="w-10 h-10 text-luxury-gold animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto px-4 py-6 md:px-0">
            {/* Header */}
            <div className="relative pb-6 mb-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-luxury-text font-serif leading-tight flex items-center gap-3">
                            <div className="p-2 bg-luxury-gold/10 rounded-xl border border-luxury-gold/20">
                                <FileImage className="w-6 h-6 text-luxury-gold" />
                            </div>
                            File
                        </h1>
                    </div>
                    <button
                        onClick={() => setShowUploader(true)}
                        className="p-3 bg-luxury-gold text-luxury-bg rounded-xl hover:bg-luxury-gold/90 shadow-lg shadow-luxury-gold/20"
                    >
                        <Upload className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Upload Modal */}
            {showUploader && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="glass-premium border-luxury-gold/20 rounded-2xl max-w-lg w-full p-6 relative">
                        <button
                            onClick={() => setShowUploader(false)}
                            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X className="w-6 h-6 text-luxury-text/60" />
                        </button>
                        <h2 className="text-xl font-bold text-luxury-text mb-4">Carica File</h2>
                        <FileUploader
                            projectId={projectId}
                            onUploadComplete={() => setShowUploader(false)}
                        />
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar mb-4 shrink-0">
                {filterOptions.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setSelectedFilter(option.value)}
                        className={cn(
                            "px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all border",
                            selectedFilter === option.value
                                ? "bg-luxury-gold text-luxury-bg border-luxury-gold"
                                : "glass-premium border-luxury-gold/10 text-luxury-text/60"
                        )}
                    >
                        {option.label}
                        {option.count > 0 && <span className="ml-2 opacity-70">({option.count})</span>}
                    </button>
                ))}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-200 font-medium">{error}</p>
                </div>
            )}

            {/* Gallery */}
            <div className="flex-1 min-h-0"> {/* Allow gallery to scroll independently if needed, though outer container scrolls */}
                <AssetGallery
                    assets={filteredAssets}
                    onDelete={(deletedId) => setAssets(prev => prev.filter(a => a.id !== deletedId))}
                />
            </div>
        </div>
    );
}
