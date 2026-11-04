import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, Download, Edit2, Check, XCircle } from 'lucide-react';
import Image from 'next/image';
import { useMetadataEditor } from '@/hooks/useMetadataEditor';
import { ROOM_TYPES } from '@/types/room';

interface GalleryImage {
    url: string;
    name: string;
    /** Storage object path: required to edit the metadata (older cards lack it). */
    path?: string;
    metadata?: Record<string, unknown>;
    type: string;
}

interface GalleryCardProps {
    items: GalleryImage[];
    projectId: string;
}

/**
 * GalleryCard - Visual Grid for Project Images
 * Displays images in a responsive grid with lightbox functionality.
 */
// Same values as GalleryStatus in backend_python/src/api/routes/update_metadata.py.
const STATUS_OPTIONS = ['approvato', 'bozza', 'in_revisione', 'scartato'] as const;

type MetadataEdit = { room?: string; status?: string };

export function GalleryCard({ items, projectId }: GalleryCardProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editRoom, setEditRoom] = useState<string>('');
    const [editStatus, setEditStatus] = useState<string>('');
    const { updateMetadata, isUpdating, error: updateError } = useMetadataEditor();
    // Saved edits, by storage path: the card shows them without a refetch.
    const [savedEdits, setSavedEdits] = useState<Record<string, MetadataEdit>>({});

    if (!items || items.length === 0) {
        return (
            <div className="text-luxury-text/60 text-sm italic">
                Nessuna immagine disponibile
            </div>
        );
    }

    const selectedImage = selectedIndex !== null ? items[selectedIndex] : null;
    const metaOf = (item: GalleryImage) => ({
        ...item.metadata,
        ...(item.path ? savedEdits[item.path] : undefined),
    });

    return (
        <>
            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-4">
                {items.map((item, idx) => (
                    <motion.div
                        key={item.url}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-luxury-bg/30 border border-luxury-gold/10 hover:border-luxury-gold/30 transition-all"
                        onClick={() => setSelectedIndex(idx)}
                    >
                        <motion.div layoutId={`image-${item.url}`} className="w-full h-full relative">
                            <Image
                                src={item.url}
                                alt={item.name}
                                fill
                                sizes="(max-width: 768px) 50vw, 33vw"
                                priority={idx < 3}
                                className="object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                        </motion.div>

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <div className="text-white text-xs font-medium truncate">
                                {(metaOf(item).room as string) || item.name}
                            </div>
                        </div>

                        {/* Action Icons */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Edit Button: only with the Storage path */}
                            {item.path && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingIndex(idx);
                                    setEditRoom((metaOf(item).room as string) || '');
                                    setEditStatus((metaOf(item).status as string) || '');
                                }}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full p-1.5 transition-colors"
                                aria-label="Modifica stanza e stato"
                            >
                                <Edit2 className="w-4 h-4 text-white" />
                            </button>
                            )}
                            {/* Zoom Icon */}
                            <div className="bg-white/20 backdrop-blur-sm rounded-full p-1.5">
                                <ZoomIn className="w-4 h-4 text-white" />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Edit Modal Overlay */}
            <AnimatePresence>
                {editingIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setEditingIndex(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="bg-luxury-bg border border-luxury-gold/20 rounded-xl p-6 max-w-md w-full"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                            <h3 className="text-luxury-gold font-medium mb-4">Modifica Metadata</h3>

                            {/* Room Selector */}
                            <div className="mb-4">
                                <label className="block text-luxury-text/70 text-sm mb-2">Stanza</label>
                                <select
                                    value={editRoom}
                                    onChange={(e) => setEditRoom(e.target.value)}
                                    className="w-full bg-luxury-bg/50 border border-luxury-gold/20 rounded-lg px-3 py-2 text-luxury-text focus:border-luxury-gold/40 focus:outline-none"
                                >
                                    <option value="">-- Seleziona --</option>
                                    {ROOM_TYPES.map(room => (
                                        <option key={room} value={room}>{room}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Selector */}
                            <div className="mb-6">
                                <label className="block text-luxury-text/70 text-sm mb-2">Stato</label>
                                <select
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                    className="w-full bg-luxury-bg/50 border border-luxury-gold/20 rounded-lg px-3 py-2 text-luxury-text focus:border-luxury-gold/40 focus:outline-none"
                                >
                                    <option value="">-- Seleziona --</option>
                                    {STATUS_OPTIONS.map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>

                            {updateError && (
                                <p role="alert" className="mb-4 text-sm text-red-400">
                                    Salvataggio non riuscito: {updateError}
                                </p>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={async () => {
                                        const filePath = items[editingIndex]?.path;
                                        if (!filePath) return;
                                        // Only the chosen fields: an empty select leaves the value as is.
                                        const edit: MetadataEdit = {
                                            ...(editRoom ? { room: editRoom } : {}),
                                            ...(editStatus ? { status: editStatus } : {}),
                                        };
                                        const success = await updateMetadata({ projectId, filePath, ...edit });
                                        if (success) {
                                            setSavedEdits((prev) => ({
                                                ...prev,
                                                [filePath]: { ...prev[filePath], ...edit },
                                            }));
                                            setEditingIndex(null);
                                        }
                                    }}
                                    // The backend needs at least one field to update.
                                    disabled={isUpdating || (!editRoom && !editStatus)}
                                    className="flex-1 bg-luxury-gold hover:bg-luxury-gold/80 text-black font-medium py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <Check className="w-4 h-4" />
                                    {isUpdating ? 'Salvataggio...' : 'Salva'}
                                </button>
                                <button
                                    onClick={() => setEditingIndex(null)}
                                    disabled={isUpdating}
                                    className="flex-1 bg-luxury-text/10 hover:bg-luxury-text/20 text-luxury-text font-medium py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <XCircle className="w-4 h-4" />
                                    Annulla
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setSelectedIndex(null)}
                    >
                        {/* Close Button */}
                        <button
                            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
                            onClick={() => setSelectedIndex(null)}
                        >
                            <X className="w-6 h-6 text-white" />
                        </button>

                        {/* Navigation */}
                        {items.length > 1 && (
                            <>
                                <button
                                    className="absolute left-4 bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedIndex(selectedIndex! > 0 ? selectedIndex! - 1 : items.length - 1);
                                    }}
                                >
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    className="absolute right-4 bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedIndex(selectedIndex! < items.length - 1 ? selectedIndex! + 1 : 0);
                                    }}
                                >
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </>
                        )}

                        {/* Image */}
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            className="max-w-6xl max-h-[90vh] relative"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                            <motion.div
                                layoutId={`image-${selectedImage.url}`}
                                className="relative w-full aspect-[4/3] md:aspect-auto md:h-[80vh]"
                            >
                                <Image
                                    src={selectedImage.url}
                                    alt={selectedImage.name}
                                    fill
                                    sizes="90vw"
                                    priority
                                    className="object-contain rounded-lg"
                                />
                            </motion.div>

                            {/* Info Bar */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
                                <div className="text-white font-medium">{selectedImage.name}</div>
                                {!!selectedImage.metadata?.room && (
                                    <div className="text-white/70 text-sm mt-1">
                                        {selectedImage.metadata.room as string}
                                    </div>
                                )}
                            </div>

                            {/* Download Button */}
                            <a
                                href={selectedImage.url}
                                download={selectedImage.name}
                                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                                <Download className="w-5 h-5 text-white" />
                            </a>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
