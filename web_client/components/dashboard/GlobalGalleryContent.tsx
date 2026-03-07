"use client";

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AssetGallery } from '@/components/dashboard/AssetGallery';
import { groupAssetsByType, MediaAsset } from '@/lib/media-utils';
import { 
    LayoutGrid, 
    Image as ImageIcon, 
    Video, 
    FileText, 
    Sparkles, 
    Filter,
    ChevronDown,
    Search
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { GalleryAsset } from '@/types/gallery';
import { SydLoader } from '@/components/ui/SydLoader';

type SortOption = 'newest' | 'oldest' | 'name';
type FilterType = 'all' | 'image' | 'render' | 'video' | 'quote';

export function GlobalGalleryContent() {
    const { user: _user } = useAuth();
    const { data: projects = [], isLoading: projectsLoading } = useProjects();
    const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [searchQuery, setSearchQuery] = useState('');
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

    // Aggregate assets across all projects
    const [allAssets, _setAllAssets] = useState<MediaAsset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState(false);

    // Grouping & Filtering
    const groupedAssets = useMemo(() => {
        // Filter by type
        let filtered = allAssets;
        if (selectedFilter !== 'all') {
            filtered = allAssets.filter(a => a.type === selectedFilter);
        }

        // Filter by search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(a => 
                (a.title || '').toLowerCase().includes(q) || 
                (a.metadata?.projectId as string || '').toLowerCase().includes(q)
            );
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
            const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt || 0).getTime();
            
            if (sortBy === 'newest') return timeB - timeA;
            if (sortBy === 'oldest') return timeA - timeB;
            return (a.title || '').localeCompare(b.title || '');
        });

        return groupAssetsByType(filtered);
    }, [allAssets, selectedFilter, sortBy, searchQuery]);

    const filterOptions = [
        { value: 'all', label: 'Tutti i File', icon: LayoutGrid },
        { value: 'image', label: 'Foto Caricate', icon: ImageIcon },
        { value: 'render', label: 'AI Renders', icon: Sparkles },
        { value: 'video', label: 'Video', icon: Video },
        { value: 'quote', label: 'Preventivi', icon: FileText },
    ];

    if (projectsLoading || assetsLoading) {
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
        <div className="flex flex-col w-full h-full">
            {/* Header / Stats */}
            <div className="mb-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-luxury-text font-serif leading-tight">
                            Archivio <span className="text-luxury-gold italic">Media</span>
                        </h1>
                        <p className="text-luxury-text/60 mt-3 text-lg font-light max-w-xl">
                            Tutti i documenti, i render e le acquisizioni vision aggregate dai tuoi progetti.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-luxury-gold/10 border border-luxury-gold/20 rounded-2xl">
                            <span className="text-luxury-gold font-bold text-xl">{allAssets.length}</span>
                            <span className="text-luxury-text/40 text-xs ml-2 uppercase tracking-widest font-bold">Elementi</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 mb-12 sticky top-0 z-20 py-4 bg-dashboard-bg/80 backdrop-blur-md -mx-4 px-4 md:mx-0 md:px-0">
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

                {/* Filter Selector */}
                <div className="relative">
                    <button 
                        onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                        className="flex items-center gap-3 bg-luxury-bg/40 border border-luxury-gold/10 rounded-2xl px-5 py-3 text-sm font-bold text-luxury-text hover:border-luxury-gold/30 transition-all"
                    >
                        <Filter className="w-4 h-4 text-luxury-gold" />
                        {filterOptions.find(o => o.value === selectedFilter)?.label}
                        <ChevronDown className={cn("w-4 h-4 text-luxury-text/30 transition-transform", isFilterMenuOpen && "rotate-180")} />
                    </button>

                    <AnimatePresence>
                        {isFilterMenuOpen && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute right-0 mt-2 w-64 bg-luxury-bg/95 border border-luxury-gold/20 rounded-2xl shadow-2xl backdrop-blur-xl p-2 overflow-hidden"
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
            <div className="space-y-12 md:space-y-16 pb-20">
                {Object.entries(groupedAssets).map(([groupName, groupAssets]) => {
                    return (
                        <motion.section
                            key={groupName}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className="flex items-center gap-4 mb-8">
                                <h2 className="text-2xl font-bold text-luxury-text/90 font-serif capitalize">
                                    {groupName === 'image' ? 'Fotografie' : 
                                     groupName === 'render' ? 'Progetti 3D' : 
                                     groupName === 'video' ? 'Video Ispezioni' : 'Documentazione'}
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
                            Inizia una conversazione con Syd per generare render o caricare foto dei tuoi ambienti.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
