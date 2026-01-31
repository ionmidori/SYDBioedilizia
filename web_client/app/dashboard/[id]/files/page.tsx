'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AssetGallery } from '@/components/dashboard/AssetGallery';
import { FileUploader } from '@/components/dashboard/FileUploader';
import { extractMediaFromMessages, groupAssetsByType, MediaAsset } from '@/lib/media-utils';
import { Loader2, FileImage, Upload, X } from 'lucide-react';
import { useChatHistory } from '@/hooks/useChatHistory';

import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ProjectFilesPage() {
    const params = useParams();
    const projectId = params.id as string;

    const { historyLoaded, historyMessages } = useChatHistory(projectId);
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [selectedFilter, setSelectedFilter] = useState<string>('all');
    const [showUploader, setShowUploader] = useState(false);

    // Initial load from chat history
    useEffect(() => {
        if (historyLoaded && historyMessages.length > 0) {
            const extractedAssets = extractMediaFromMessages(historyMessages);
            setAssets(prev => {
                // Merge with existing assets to avoid duplicates
                const uniqueAssets = [...prev];
                extractedAssets.forEach(newAsset => {
                    if (!uniqueAssets.some(a => a.id === newAsset.id)) {
                        uniqueAssets.push(newAsset);
                    }
                });
                return uniqueAssets;
            });
        }
    }, [historyLoaded, historyMessages]);

    // Real-time subscription to project files
    useEffect(() => {
        if (!projectId || !db) return;

        const q = query(
            collection(db, 'projects', projectId, 'files'),
            orderBy('uploadedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const uploadedFiles = snapshot.docs.map((doc: any) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: data.type === 'document' ? 'quote' : data.type, // Map 'document' to 'quote' for now or handle appropriately
                    url: data.url,
                    thumbnail: data.type === 'image' ? data.url : undefined,
                    title: data.name,
                    createdAt: data.uploadedAt?.toDate() || new Date(),
                    timestamp: data.uploadedAt?.toDate() || new Date(), // Required by MediaAsset interface
                    metadata: {
                        size: data.size,
                        uploadedBy: data.uploadedBy
                    }
                } as MediaAsset;
            });

            setAssets(prev => {
                const uniqueAssets = [...prev];
                // Remove existing uploaded files to prevent duplicates when updating
                const filtered = uniqueAssets.filter(a => !uploadedFiles.some((u: MediaAsset) => u.id === a.id));
                return [...uploadedFiles, ...filtered].sort((a, b) =>
                    b.createdAt.getTime() - a.createdAt.getTime()
                );
            });
        });

        return () => unsubscribe();
    }, [projectId]);

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

    // Loading State
    if (!historyLoaded) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-700">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-luxury-gold/20 border-t-luxury-gold rounded-full animate-spin shadow-lg shadow-luxury-gold/10" />
                    <div className="absolute inset-0 bg-luxury-gold/5 blur-xl rounded-full" />
                </div>
                <p className="mt-8 text-luxury-gold font-bold tracking-[0.2em] uppercase text-xs animate-pulse">
                    Caricamento Archivio...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full max-w-7xl mx-auto space-y-10 py-6">
            {/* Header */}
            <div className="relative border-b border-luxury-gold/10 pb-8">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-luxury-teal/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="relative z-10 flex items-start justify-between">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-luxury-text font-serif leading-tight flex items-center gap-4">
                            <div className="p-3 bg-luxury-gold/10 rounded-2xl border border-luxury-gold/20 shadow-lg shadow-luxury-gold/5">
                                <FileImage className="w-8 h-8 text-luxury-gold" />
                            </div>
                            Galleria <span className="text-luxury-gold italic">& File</span>
                        </h1>
                        <p className="text-luxury-text/50 mt-3 max-w-2xl font-medium text-sm md:text-base leading-relaxed">
                            Tutte le immagini, render e preventivi generati dalla conversazione con SYD.
                        </p>
                    </div>

                    {/* Upload Button */}
                    <button
                        onClick={() => setShowUploader(true)}
                        className="px-6 py-3 bg-luxury-gold text-luxury-bg font-bold rounded-xl hover:bg-luxury-gold/90 transition-all shadow-lg shadow-luxury-gold/20 flex items-center gap-3"
                    >
                        <Upload className="w-5 h-5" />
                        <span className="hidden md:inline">Carica File</span>
                    </button>
                </div>
            </div>

            {/* Upload Modal */}
            {showUploader && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-premium border-luxury-gold/20 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8 relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setShowUploader(false)}
                            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X className="w-6 h-6 text-luxury-text/60 hover:text-luxury-text" />
                        </button>

                        {/* Modal Header */}
                        <h2 className="text-2xl font-bold text-luxury-text mb-6 flex items-center gap-3">
                            <Upload className="w-6 h-6 text-luxury-gold" />
                            Carica File al Progetto
                        </h2>

                        {/* File Uploader */}
                        <FileUploader
                            projectId={projectId}
                            onUploadComplete={(files) => {
                                console.log('Upload completato:', files);
                                setShowUploader(false);
                                // TODO: Refresh asset list
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {filterOptions.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setSelectedFilter(option.value)}
                        className={`
                            relative px-6 py-3 rounded-2xl font-bold text-sm whitespace-nowrap transition-all duration-500 border overflow-hidden group
                            ${selectedFilter === option.value
                                ? 'bg-luxury-gold border-luxury-gold text-luxury-bg shadow-2xl shadow-luxury-gold/30'
                                : 'glass-premium border-luxury-gold/10 text-luxury-text/60 hover:text-luxury-text hover:border-luxury-gold/30 hover:bg-white/5'
                            }
                        `}
                    >
                        {/* Hover Shine Effect */}
                        {selectedFilter !== option.value && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        )}

                        <span className="relative z-10 tracking-tight">{option.label}</span>
                        {option.count > 0 && (
                            <span className={`ml-2 px-2 py-0.5 rounded-lg text-xs font-extrabold relative z-10 ${selectedFilter === option.value
                                ? 'bg-luxury-bg/20 text-luxury-bg'
                                : 'bg-luxury-gold/10 text-luxury-gold'
                                }`}>
                                {option.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Gallery */}
            <AssetGallery assets={filteredAssets} />
        </div>
    );
}
