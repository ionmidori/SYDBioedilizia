"use client";

import { useMemo, useState } from 'react';
import { AlertCircle, Upload, X } from 'lucide-react';
import { AssetGallery } from '@/components/dashboard/AssetGallery';
import { FileUploader } from '@/components/dashboard/FileUploader';
import { SydLoader } from '@/components/ui/SydLoader';
import { useChatContext } from '@/hooks/useChatContext';
import { useHouseFiles } from '@/hooks/useHouseFiles';
import { cn } from '@/lib/utils';
import type { MediaAsset } from '@/lib/media-utils';

const ALL = 'all';
const UNFILED = 'unfiled';

const TYPE_FILTERS = [
    { value: ALL, label: 'Tutti' },
    { value: 'image', label: 'Foto' },
    { value: 'video', label: 'Video' },
    { value: 'render', label: 'Render' },
    { value: 'quote', label: 'Documenti' },
] as const;

interface HouseMediaViewProps {
    chatId: string;
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "px-4 py-2 min-h-11 rounded-xl font-bold text-xs whitespace-nowrap transition-colors border touch-manipulation",
                active
                    ? "bg-luxury-gold text-luxury-bg border-luxury-gold"
                    : "glass-premium border-luxury-gold/10 text-luxury-text/60 hover:text-luxury-text"
            )}
        >
            {label}
            {count > 0 && <span className="ml-2 opacity-70">({count})</span>}
        </button>
    );
}

/**
 * The media of the house (Phase 139): every photo, video, render and document
 * of the user's chat, live, by room. Uploads are filed in the room on screen
 * (none from "Senza stanza"), else in the chat's active room.
 */
export function HouseMediaView({ chatId }: HouseMediaViewProps) {
    const { assets, loaded, error } = useHouseFiles(chatId);
    const { rooms, activeRoomId } = useChatContext();
    const [roomFilter, setRoomFilter] = useState<string>(ALL);
    const [typeFilter, setTypeFilter] = useState<string>(ALL);
    const [uploading, setUploading] = useState(false);

    // A file of a room the house no longer has counts as one of no room.
    const roomOf = useMemo(() => {
        const known = new Set(rooms.map((room) => room.room_id));
        return (a: MediaAsset) => {
            const roomId = a.metadata?.roomId ?? null;
            return roomId !== null && known.has(roomId) ? roomId : null;
        };
    }, [rooms]);
    const inRoom = useMemo(() => {
        if (roomFilter === ALL) return assets;
        if (roomFilter === UNFILED) return assets.filter((a) => roomOf(a) === null);
        return assets.filter((a) => roomOf(a) === roomFilter);
    }, [assets, roomFilter, roomOf]);
    const shown = typeFilter === ALL ? inRoom : inRoom.filter((a) => a.type === typeFilter);
    const unfiled = assets.filter((a) => roomOf(a) === null).length;
    // Filed in the room on screen; from "Senza stanza" in none; else in the chat's active room.
    const uploadRoom = roomFilter === UNFILED ? null : roomFilter !== ALL ? roomFilter : activeRoomId;

    if (!loaded) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <SydLoader size="lg" />
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-serif font-bold text-luxury-text">Stanze e media</h2>
                <button
                    type="button"
                    onClick={() => setUploading(true)}
                    aria-label="Carica file"
                    className="flex items-center gap-2 min-h-11 px-4 rounded-xl bg-luxury-gold text-luxury-bg text-xs font-bold hover:bg-luxury-gold/90 shadow-lg shadow-luxury-gold/20 touch-manipulation"
                >
                    <Upload aria-hidden="true" className="w-4 h-4" />
                    Carica
                </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar" aria-label="Stanza">
                <FilterButton active={roomFilter === ALL} label="Tutte le stanze" count={assets.length} onClick={() => setRoomFilter(ALL)} />
                {rooms.map((room) => (
                    <FilterButton
                        key={room.room_id}
                        active={roomFilter === room.room_id}
                        label={room.label}
                        count={assets.filter((a) => roomOf(a) === room.room_id).length}
                        onClick={() => setRoomFilter(room.room_id)}
                    />
                ))}
                {unfiled > 0 && (
                    <FilterButton active={roomFilter === UNFILED} label="Senza stanza" count={unfiled} onClick={() => setRoomFilter(UNFILED)} />
                )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar" aria-label="Tipo di file">
                {TYPE_FILTERS.map((filter) => (
                    <FilterButton
                        key={filter.value}
                        active={typeFilter === filter.value}
                        label={filter.label}
                        count={filter.value === ALL ? inRoom.length : inRoom.filter((a) => a.type === filter.value).length}
                        onClick={() => setTypeFilter(filter.value)}
                    />
                ))}
            </div>

            {error && (
                <div role="alert" className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                    <AlertCircle aria-hidden="true" className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-200 font-medium">{error}</p>
                </div>
            )}

            {!error && shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-luxury-text/50">
                    Nessun file qui. Mandali in chat o caricali con «Carica».
                </p>
            ) : (
                <AssetGallery assets={shown} />
            )}

            {uploading && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="glass-premium border-luxury-gold/20 rounded-2xl max-w-lg w-full p-6 relative">
                        <button
                            type="button"
                            onClick={() => setUploading(false)}
                            aria-label="Chiudi"
                            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X aria-hidden="true" className="w-6 h-6 text-luxury-text/60" />
                        </button>
                        <h2 className="text-xl font-bold text-luxury-text mb-4">Carica file</h2>
                        <FileUploader projectId={chatId} roomId={uploadRoom} onUploadComplete={() => setUploading(false)} />
                    </div>
                </div>
            )}
        </div>
    );
}
