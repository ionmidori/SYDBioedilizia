"use client";

import { useEffect, useState, useMemo } from 'react';
import { collectionGroup, query, orderBy, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData, collection, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { AssetGallery } from '@/components/dashboard/AssetGallery';
import { MediaAsset } from '@/lib/media-utils';
import { Loader2, LayoutGrid, Calendar, FolderKanban, ChevronDown, Search, X, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlobalFileUploader } from '@/components/dashboard/GlobalFileUploader';
import { projectsApi } from '@/lib/projects-api';
import { galleryApi } from '@/lib/gallery-api';

type GroupingMode = 'project' | 'type' | 'date';

interface Project {
    id: string;
    name: string;
}

const ITEMS_PER_PAGE = 50;

/**
 * Reusable Global Gallery Content
 * Can be used in standalone page or SwipeLayout
 */
export function GlobalGalleryContent() {
    const { user } = useAuth();
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [groupingMode, setGroupingMode] = useState<GroupingMode>('project');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Fetch all projects for name mapping
    useEffect(() => {
        if (!user?.uid || !db) return;

        const fetchProjects = async () => {
            try {
                const data = await projectsApi.listProjects();
                const projectList = data.map(p => ({
                    id: p.session_id,
                    name: p.title || 'Progetto Senza Nome'
                }));
                setProjects(projectList);
            } catch (error) {
                console.error('[GlobalGallery] Error fetching projects:', error);
            }
        };

        fetchProjects();
    }, [user?.uid]);

    // Fetch files with pagination
    const fetchFiles = async (isInitial = true) => {
        if (!user || (isLoadingMore && !isInitial)) return;

        if (isInitial) {
            setLoading(true);
            setHasMore(true);
            setLastVisible(null);
        } else {
            setIsLoadingMore(true);
        }

        try {
            // API Call instead of direct Firestore
            const lastId = !isInitial && assets.length > 0 ? assets[assets.length - 1].id : undefined;
            const data = await galleryApi.listAssets(ITEMS_PER_PAGE, lastId);

            const newFiles = data.assets.map(asset => ({
                ...asset,
                metadata: {
                    ...asset.metadata,
                    projectName: projects.find(p => p.id === asset.metadata?.projectId)?.name || 'Progetto Sconosciuto'
                }
            }));

            if (isInitial) {
                setAssets(newFiles);
            } else {
                setAssets(prev => [...prev, ...newFiles]);
            }

            setHasMore(data.hasMore);

        } catch (error) {
            console.error('[GlobalGallery] Error fetching files:', error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    };

    // Initial Load Effect (and auto-refresh when projects load)
    useEffect(() => {
        if (user?.uid) {
            fetchFiles(true);
        }
    }, [user?.uid, refreshTrigger, projects.length]);

    // Grouping logic (with Filter)
    const groupedAssets = useMemo(() => {
        const groups: Record<string, MediaAsset[]> = {};

        // Filter assets first
        const filteredAssets = assets.filter(asset => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return (
                asset.title?.toLowerCase().includes(query) ||
                asset.metadata?.projectName?.toLowerCase().includes(query) ||
                asset.type.toLowerCase().includes(query)
            );
        });

        filteredAssets.forEach(asset => {
            let groupKey = '';

            switch (groupingMode) {
                case 'project':
                    groupKey = asset.metadata?.projectName || 'Senza Progetto';
                    break;
                case 'type':
                    groupKey = asset.type === 'image' ? 'Immagini Caricate' :
                        asset.type === 'render' ? 'Render Generati' :
                            asset.type === 'quote' ? 'Preventivi PDF' : 'Altri';
                    break;
                case 'date':
                    const now = new Date();
                    const assetDate = new Date(asset.timestamp);

                    // Normalize to midnight for accurate calendar day difference
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const target = new Date(assetDate.getFullYear(), assetDate.getMonth(), assetDate.getDate());

                    const diffTime = today.getTime() - target.getTime();
                    const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                    if (daysDiff === 0) groupKey = 'Oggi';
                    else if (daysDiff === 1) groupKey = 'Ieri';
                    else if (daysDiff <= 7) groupKey = 'Questa Settimana';
                    else if (daysDiff <= 30) groupKey = 'Questo Mese';
                    else groupKey = 'Più Vecchi';
                    break;
            }

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(asset);
        });

        return groups;
    }, [assets, groupingMode]);

    const groupingOptions = [
        { value: 'project' as GroupingMode, label: 'Per Progetto', icon: FolderKanban },
        { value: 'type' as GroupingMode, label: 'Per Tipo', icon: LayoutGrid },
        { value: 'date' as GroupingMode, label: 'Per Data', icon: Calendar },
    ];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-700">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-luxury-gold/20 border-t-luxury-gold rounded-full animate-spin shadow-lg shadow-luxury-gold/10" />
                    <div className="absolute inset-0 bg-luxury-gold/5 blur-xl rounded-full" />
                </div>
                <p className="mt-8 text-luxury-gold font-bold tracking-[0.2em] uppercase text-xs animate-pulse">
                    Caricamento Galleria Globale...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full mx-auto space-y-6 md:space-y-10 py-4 md:py-6 px-4 md:px-8">
            {/* Header */}
            <div className="relative border-b border-luxury-gold/10 pb-6 md:pb-8 shrink-0">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-luxury-teal/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-luxury-text font-serif leading-tight flex items-center gap-3 md:gap-4">
                            <div className="p-2 md:p-3 bg-luxury-gold/10 rounded-xl md:rounded-2xl border border-luxury-gold/20 shadow-lg shadow-luxury-gold/5">
                                <LayoutGrid className="w-6 h-6 md:w-8 md:h-8 text-luxury-gold" />
                            </div>
                            Galleria <span className="text-luxury-gold italic">Globale</span>
                        </h1>
                        <p className="text-luxury-text/50 mt-2 md:mt-3 max-w-2xl font-medium text-sm md:text-base leading-relaxed">
                            Tutti i contenuti da tutti i tuoi progetti, organizzati come preferisci.
                        </p>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsUploadModalOpen(true)}
                        className="group relative flex items-center gap-3 px-6 py-3 bg-luxury-gold/10 border border-luxury-gold/30 hover:border-luxury-gold/50 rounded-xl overflow-hidden transition-all duration-300 shadow-lg shadow-luxury-gold/5"
                    >
                        {/* Internal Glow Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/0 to-luxury-gold/0 group-hover:via-luxury-gold/10 transition-all duration-500 rounded-xl" />

                        <div className="relative z-10 flex items-center gap-3">
                            <div className="p-1.5 bg-luxury-gold/20 rounded-lg text-luxury-gold">
                                <Upload className="w-5 h-5" />
                            </div>
                            <span className="text-luxury-gold font-bold text-sm md:text-base whitespace-nowrap">
                                Carica File
                            </span>
                        </div>
                    </motion.button>
                </div>
            </div>

            {/* Upload Modal */}
            <AnimatePresence>
                {isUploadModalOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsUploadModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg bg-luxury-bg border border-luxury-gold/20 rounded-3xl p-6 shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-luxury-text font-serif">Carica File</h3>
                                <button
                                    onClick={() => setIsUploadModalOpen(false)}
                                    className="p-2 hover:bg-white/5 rounded-full text-luxury-text/50 hover:text-luxury-text transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <GlobalFileUploader
                                projects={projects}
                                onUploadComplete={() => {
                                    setRefreshTrigger(prev => prev + 1);
                                    setTimeout(() => setIsUploadModalOpen(false), 1000);
                                }}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Search and Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 shrink-0">
                {/* Search Input */}
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-luxury-gold/50" />
                    </div>
                    <input
                        type="text"
                        placeholder="Cerca file, progetti o tipi..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 md:py-4 border border-luxury-gold/20 rounded-2xl leading-5 bg-luxury-bg/50 glass-premium text-luxury-text placeholder-luxury-text/30 focus:outline-none focus:ring-1 focus:ring-luxury-gold/50 focus:border-luxury-gold/50 sm:text-sm transition-all duration-300 shadow-sm hover:shadow-md"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                            <X className="h-5 w-5 text-luxury-text/30 hover:text-luxury-gold cursor-pointer transition-colors" />
                        </button>
                    )}
                </div>

                {/* Grouping Selector - Mobile Optimized Dropdown */}
                <div className="relative md:w-64">
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={cn(
                            "w-full flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4",
                            "bg-luxury-bg/50 backdrop-blur-xl border rounded-2xl transition-all duration-300",
                            "text-luxury-text font-bold text-sm md:text-base",
                            "active:scale-[0.98] touch-manipulation",
                            isDropdownOpen
                                ? "border-luxury-gold shadow-lg shadow-luxury-gold/20"
                                : "border-luxury-gold/20 hover:border-luxury-gold/40 shadow-md"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            {groupingOptions.find(o => o.value === groupingMode)?.icon && (
                                <div className="p-2 bg-luxury-gold/10 rounded-lg">
                                    {(() => {
                                        const Icon = groupingOptions.find(o => o.value === groupingMode)!.icon;
                                        return <Icon className="w-4 h-4 md:w-5 md:h-5 text-luxury-gold" />;
                                    })()}
                                </div>
                            )}
                            <span>
                                {groupingOptions.find(o => o.value === groupingMode)?.label}
                            </span>
                        </div>
                        <ChevronDown className={cn(
                            "w-5 h-5 text-luxury-gold transition-transform duration-300",
                            isDropdownOpen && "rotate-180"
                        )} />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                        {isDropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="absolute top-full left-0 right-0 mt-2 z-50 bg-luxury-bg/80 backdrop-blur-2xl border border-luxury-gold/20 rounded-2xl overflow-hidden shadow-2xl"
                            >
                                {groupingOptions.map((option) => {
                                    const Icon = option.icon;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => {
                                                setGroupingMode(option.value);
                                                setIsDropdownOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-3 transition-all touch-manipulation",
                                                "active:scale-[0.98]",
                                                groupingMode === option.value
                                                    ? "bg-luxury-gold/20 text-luxury-gold border-l-4 border-luxury-gold"
                                                    : "text-luxury-text/70 hover:text-luxury-text hover:bg-white/5 border-l-4 border-transparent"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                groupingMode === option.value
                                                    ? "bg-luxury-gold/20"
                                                    : "bg-white/5"
                                            )}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <span className="font-bold text-sm">{option.label}</span>
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Grouped Gallery Sections */}
            <div className="space-y-8 md:space-y-12 pb-20">
                {Object.entries(groupedAssets).map(([groupName, groupAssets]) => (
                    <motion.section
                        key={groupName}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-4 md:space-y-6"
                    >
                        {/* Section Header */}
                        <div className="flex items-center gap-3 md:gap-4 pb-3 border-b border-luxury-gold/10">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-luxury-gold/20 to-transparent" />
                            <h2 className="text-lg md:text-2xl font-bold text-luxury-text font-serif tracking-tight">
                                {groupName}
                            </h2>
                            <span className="px-3 py-1 bg-luxury-gold/10 border border-luxury-gold/20 rounded-full text-luxury-gold text-xs md:text-sm font-bold">
                                {groupAssets.length}
                            </span>
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-luxury-gold/20 to-transparent" />
                        </div>

                        {/* Assets Grid */}
                        <AssetGallery
                            assets={groupAssets}
                            onDelete={(deletedId) => {
                                setAssets(prev => prev.filter(a => a.id !== deletedId));
                            }}
                        />
                    </motion.section>
                ))}

                {/* Load More Button */}
                {hasMore && !loading && assets.length > 0 && !searchQuery && (
                    <div className="flex justify-center pt-8">
                        <button
                            onClick={() => fetchFiles(false)}
                            disabled={isLoadingMore}
                            className="group flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 border border-luxury-gold/20 hover:border-luxury-gold/40 rounded-2xl transition-all duration-300 backdrop-blur-md"
                        >
                            {isLoadingMore ? (
                                <Loader2 className="w-5 h-5 text-luxury-gold animate-spin" />
                            ) : (
                                <div className="p-1 rounded-full bg-luxury-gold/10 group-hover:bg-luxury-gold/20 transition-colors">
                                    <ChevronDown className="w-4 h-4 text-luxury-gold" />
                                </div>
                            )}
                            <span className="text-luxury-text font-bold text-sm tracking-widest uppercase">
                                {isLoadingMore ? 'Caricamento...' : 'Carica Altri File'}
                            </span>
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {Object.keys(groupedAssets).length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
                        <div className="p-4 md:p-6 bg-luxury-gold/5 rounded-3xl border border-luxury-gold/10 mb-6">
                            <LayoutGrid className="w-12 h-12 md:w-16 md:h-16 text-luxury-gold/40" />
                        </div>
                        <h3 className="text-xl md:text-2xl font-bold text-luxury-text/60 mb-2">
                            Nessun File Trovato
                        </h3>
                        <p className="text-luxury-text/40 text-sm md:text-base max-w-md">
                            Carica file nei tuoi progetti per vederli apparire qui.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
