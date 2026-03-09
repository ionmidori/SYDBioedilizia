"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AssetGallery } from '@/components/dashboard/AssetGallery';
import { MediaAsset } from '@/lib/media-utils';
import { 
    LayoutGrid, 
    Image as ImageIcon, 
    Video, 
    FileText, 
    Sparkles, 
    Filter,
    ChevronDown,
    Search,
    Loader2,
    FolderKanban,
    Layers
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGalleryAssets } from '@/hooks/use-gallery';
import { cn } from '@/lib/utils';
import { SydLoader } from '@/components/ui/SydLoader';

type SortOption = 'newest' | 'oldest' | 'name';
type FilterType = 'all' | 'image' | 'render' | 'video' | 'quote';
type GroupByOption = 'type' | 'project';

export function GlobalGalleryContent() {
    const { user, isAnonymous } = useAuth();
    const isAuthenticated = !!user && !isAnonymous;
    
    // Modern State Management: Use TanStack Query
    const { 
        data, 
        isLoading: assetsLoading, 
        fetchNextPage, 
        hasNextPage, 
        isFetchingNextPage 
    } = useGalleryAssets(50, isAuthenticated);

    const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState<GroupByOption>('type');
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
    
    const filterMenuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (isFilterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setIsFilterMenuOpen(false);
            }
        };

        if (isFilterMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isFilterMenuOpen]);

    // Aggregate assets across all paginated pages
    const allAssets = useMemo(() => {
        return (data?.pages.flatMap(page => page.assets) || []) as MediaAsset[];
    }, [data]);

    // Grouping & Filtering
    const groupedAssets = useMemo(() => {
        // 1. Filter by type
        let filtered = allAssets;
        if (selectedFilter !== 'all') {
            filtered = allAssets.filter(a => a.type === selectedFilter);
        }

        // 2. Filter by search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(a => 
                (a.title || '').toLowerCase().includes(q) || 
                (a.metadata?.projectName as string || '').toLowerCase().includes(q) ||
                (a.metadata?.projectId as string || '').toLowerCase().includes(q)
            );
        }

        // 3. Sort
        filtered = [...filtered].sort((a, b) => {
            const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt || 0).getTime();
            
            if (sortBy === 'newest') return timeB - timeA;
            if (sortBy === 'oldest') return timeA - timeB;
            return (a.title || '').localeCompare(b.title || '');
        });

        // 4. Group based on selected grouping strategy
        return filtered.reduce((acc, asset) => {
            let key = '';
            
            if (groupBy === 'type') {
                key = asset.type;
            } else if (groupBy === 'project') {
                // Use projectName if available, fallback to projectId or 'Senza Progetto'
                key = (asset.metadata?.projectName as string) || (asset.metadata?.projectId as string) || 'Senza Progetto';
            }

            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(asset);
            return acc;
        }, {} as Record<string, MediaAsset[]>);
    }, [allAssets, selectedFilter, sortBy, searchQuery, groupBy]);

    const filterOptions = [
        { value: 'all', label: 'Tutti i File', icon: LayoutGrid },
        { value: 'image', label: 'Foto Caricate', icon: ImageIcon },
        { value: 'render', label: 'AI Renders', icon: Sparkles },
        { value: 'video', label: 'Video', icon: Video },
        { value: 'quote', label: 'Preventivi', icon: FileText },
    ];

    if (assetsLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <SydLoader size="lg" />
                <p className="text-luxury-text/40 text-sm mt-4 animate-pulse font-serif italic">
                    Catalogazione archivio in corso...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full max-w-7xl mx-auto pt-2 pb-6 px-4 md:px-8">
            {/* Header / Stats */}
            <div className="mb-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-luxury-text font-serif leading-tight">
                        Galleria
                    </h1>
                    <div className="px-4 py-2 bg-luxury-gold/10 border border-luxury-gold/20 rounded-2xl flex items-center shrink-0 gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-luxury-text/50 text-[10px] uppercase tracking-widest font-bold hidden sm:block leading-none mb-1">
                                File Archiviati
                            </span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-luxury-gold font-bold text-xl leading-none">{allAssets.length}</span>
                                <span className="text-luxury-text/40 text-xs uppercase tracking-widest font-bold sm:hidden">Elementi</span>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-luxury-text/60 text-base md:text-lg font-light max-w-xl">
                    Tutti i documenti, i render e le acquisizioni vision aggregate dai tuoi progetti.
                </p>
            </div>

            {/* Premium Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 sticky top-0 z-20 pb-4 pt-2 bg-luxury-bg/80 backdrop-blur-md border-b border-luxury-gold/5">
                <div className="flex flex-row gap-3 w-full md:flex-1">
                    {/* Search */}
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-text/30 group-focus-within:text-luxury-gold transition-colors" />
                        <input 
                            type="text"
                            placeholder="Cerca per nome o progetto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-luxury-bg/40 border border-luxury-gold/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-luxury-text placeholder:text-luxury-text/30 focus:outline-none focus:border-luxury-gold/40 focus:bg-luxury-bg/60 transition-all"
                        />
                    </div>

                    {/* Grouping Toggle (Type vs Project) */}
                    <div className="flex items-center p-1 bg-luxury-bg/40 border border-luxury-gold/10 rounded-2xl shrink-0">
                        <button
                            onClick={() => setGroupBy('type')}
                            className={cn(
                                "flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300",
                                groupBy === 'type' 
                                    ? "bg-luxury-gold text-luxury-bg shadow-sm" 
                                    : "text-luxury-text/50 hover:text-luxury-text"
                            )}
                        >
                            <Layers className="w-4 h-4" />
                            <span className="hidden sm:inline">Per Tipo</span>
                        </button>
                        <button
                            onClick={() => setGroupBy('project')}
                            className={cn(
                                "flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300",
                                groupBy === 'project' 
                                    ? "bg-luxury-gold text-luxury-bg shadow-sm" 
                                    : "text-luxury-text/50 hover:text-luxury-text"
                            )}
                        >
                            <FolderKanban className="w-4 h-4" />
                            <span className="hidden sm:inline">Per Progetto</span>
                        </button>
                    </div>
                </div>

                {/* Filter Selector */}
                <div className="relative shrink-0" ref={filterMenuRef}>
                    <button 
                        onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                        className="flex items-center justify-between w-full md:w-auto gap-3 bg-luxury-bg/40 border border-luxury-gold/10 rounded-2xl px-5 py-3 text-sm font-bold text-luxury-text hover:border-luxury-gold/30 transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <Filter className="w-4 h-4 text-luxury-gold" />
                            {filterOptions.find(o => o.value === selectedFilter)?.label}
                        </div>
                        <ChevronDown className={cn("w-4 h-4 text-luxury-text/30 transition-transform", isFilterMenuOpen && "rotate-180")} />
                    </button>

                    <AnimatePresence>
                        {isFilterMenuOpen && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute right-0 mt-2 w-full md:w-64 bg-luxury-bg/95 border border-luxury-gold/20 rounded-2xl shadow-2xl backdrop-blur-xl p-2 overflow-hidden z-50 origin-top-right"
                            >
                                {filterOptions.map((option) => {
                                    const Icon = option.icon;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => {
                                                setSelectedFilter(option.value as FilterType);
                                                setIsFilterMenuOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                                                selectedFilter === option.value 
                                                    ? "bg-luxury-gold text-luxury-bg" 
                                                    : "text-luxury-text/70 hover:bg-white/5 hover:text-luxury-text"
                                            )}
                                        >
                                            <div className={cn("p-1.5 rounded-lg", selectedFilter === option.value ? "bg-black/10" : "bg-luxury-gold/10")}>
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

            {/* Optimized Gallery Sections */}
            <div className={cn("pb-10", groupBy === 'project' ? "space-y-6 md:space-y-10" : "space-y-12 md:space-y-16")}>
                {Object.entries(groupedAssets).map(([groupName, groupAssets]) => {
                    // Determine display title based on grouping mode
                    let displayTitle = groupName;
                    if (groupBy === 'type') {
                        displayTitle = 
                            groupName === 'image' ? 'Fotografie' : 
                            groupName === 'render' ? 'Progetti 3D' : 
                            groupName === 'video' ? 'Video Ispezioni' : 
                            groupName === 'quote' ? 'Preventivi' : 'Documentazione';
                    }

                    return (
                        <motion.section
                            key={groupName}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className={cn("flex items-center gap-4", groupBy === 'project' ? "mb-4 md:mb-6" : "mb-8")}>
                                {groupBy === 'project' && <FolderKanban className="w-6 h-6 text-luxury-gold" />}
                                <h2 className="text-2xl font-bold text-luxury-text/90 font-serif capitalize">
                                    {displayTitle}
                                </h2>
                                <div className="h-px flex-1 bg-gradient-to-r from-luxury-gold/30 to-transparent" />
                                <span className="text-luxury-text/30 text-sm font-mono tracking-tighter">
                                    {groupAssets.length} files
                                </span>
                            </div>

                            <AssetGallery 
                                assets={groupAssets}
                            />
                        </motion.section>
                    );
                })}

                {allAssets.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="w-24 h-24 rounded-full bg-luxury-gold/5 border border-luxury-gold/10 flex items-center justify-center mb-6">
                            <ImageIcon className="w-10 h-10 text-luxury-gold/20" />
                        </div>
                        <h3 className="text-xl font-bold text-luxury-text mb-2">Galleria Vuota</h3>
                        <p className="text-luxury-text/40 max-w-xs mx-auto">
                            Non hai ancora file o foto salvati nei tuoi progetti.
                        </p>
                    </div>
                )}
            </div>

            {/* Load More Button */}
            {hasNextPage && (
                <div className="flex justify-center pb-20">
                    <button
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="flex items-center gap-2 px-6 py-3 bg-luxury-gold/10 hover:bg-luxury-gold/20 border border-luxury-gold/20 text-luxury-gold font-bold rounded-2xl transition-all disabled:opacity-50"
                    >
                        {isFetchingNextPage ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Caricamento...</span>
                            </>
                        ) : (
                            <span>Carica Altri File</span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
