'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Bath, BedDouble, CookingPot, DoorOpen, House, Loader2, Plus, Sofa, type LucideIcon } from 'lucide-react';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';
import { roomsApi } from '@/lib/rooms-api';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { RoomChip } from '@/hooks/useProjectRooms';
import { ROOM_TYPES, type RoomType } from '@/types/room';

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
    cucina: 'Cucina',
    soggiorno: 'Soggiorno',
    camera: 'Camera',
    bagno: 'Bagno',
    corridoio: 'Corridoio',
    altro: 'Altro',
};

const ROOM_TYPE_ICONS: Record<RoomType, LucideIcon> = {
    cucina: CookingPot,
    soggiorno: Sofa,
    camera: BedDouble,
    bagno: Bath,
    corridoio: DoorOpen,
    altro: House,
};

const CHIP_CLASS = cn(
    'inline-flex items-center gap-1.5 shrink-0 snap-start rounded-full border px-3',
    'h-11 md:h-9 text-sm font-medium whitespace-nowrap transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50',
);

interface RoomChipsProps {
    projectId: string;
    rooms: RoomChip[];
    activeRoomId: string | null;
    onSelect: (roomId: string) => void;
}

/**
 * Room chips above the composer (Phase 138: one chat for the whole home).
 *
 * The active room is highlighted: the next message and the photos/videos
 * uploaded now belong to it. "Nuova stanza" creates a room (type + name)
 * through the backend and makes it active; the list itself is live
 * (`useProjectRooms`). Horizontal scroll on mobile, 44px touch targets.
 */
export function RoomChips({ projectId, rooms, activeRoomId, onSelect }: RoomChipsProps) {
    const [isCreating, setIsCreating] = useState(false);

    return (
        <div
            className="flex gap-2 overflow-x-auto scrollbar-hide snap-x px-4 pt-2 pb-1 flex-shrink-0"
            role="toolbar"
            aria-label="Stanze del progetto"
        >
            {rooms.map((room) => {
                const Icon = ROOM_TYPE_ICONS[room.room_type];
                const isActive = room.room_id === activeRoomId;
                return (
                    <motion.button
                        key={room.room_id}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onSelect(room.room_id)}
                        aria-pressed={isActive}
                        className={cn(
                            CHIP_CLASS,
                            isActive
                                ? 'bg-luxury-gold text-luxury-bg border-luxury-gold'
                                : 'bg-luxury-bg/40 text-luxury-text/80 border-luxury-gold/20 hover:border-luxury-gold/50',
                        )}
                    >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span className="max-w-[10rem] truncate">{room.label}</span>
                    </motion.button>
                );
            })}
            <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsCreating(true)}
                className={cn(
                    CHIP_CLASS,
                    'border-dashed border-luxury-gold/40 text-luxury-gold hover:bg-luxury-gold/10',
                )}
            >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Nuova stanza
            </motion.button>

            <ResponsiveDrawer
                open={isCreating}
                onOpenChange={setIsCreating}
                title="Nuova stanza"
                description="Le foto e i messaggi che invii ora andranno in questa stanza."
            >
                {isCreating && (
                    <NewRoomForm
                        projectId={projectId}
                        onCreated={(roomId) => {
                            onSelect(roomId);
                            setIsCreating(false);
                        }}
                    />
                )}
            </ResponsiveDrawer>
        </div>
    );
}

function NewRoomForm({ projectId, onCreated }: { projectId: string; onCreated: (roomId: string) => void }) {
    const [roomType, setRoomType] = useState<RoomType>('bagno');
    // Empty name = the type's label ("Bagno"); a typed name wins.
    const [label, setLabel] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const room = await roomsApi.createRoom(projectId, {
                label: label.trim() || ROOM_TYPE_LABELS[roomType],
                room_type: roomType,
            });
            onCreated(room.room_id);
        } catch (err) {
            logger.debug('[RoomChips] Room not created:', err);
            setError('Non è stato possibile creare la stanza. Riprova.');
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4 md:px-0 md:pb-0">
            <fieldset className="flex flex-wrap gap-2">
                <legend className="text-sm text-luxury-text/70 mb-2">Tipo di stanza</legend>
                {ROOM_TYPES.map((type) => {
                    const Icon = ROOM_TYPE_ICONS[type];
                    const isSelected = type === roomType;
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setRoomType(type)}
                            aria-pressed={isSelected}
                            className={cn(
                                CHIP_CLASS,
                                isSelected
                                    ? 'bg-luxury-gold text-luxury-bg border-luxury-gold'
                                    : 'text-luxury-text/80 border-luxury-gold/20 hover:border-luxury-gold/50',
                            )}
                        >
                            <Icon className="w-4 h-4" aria-hidden="true" />
                            {ROOM_TYPE_LABELS[type]}
                        </button>
                    );
                })}
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm text-luxury-text/70">
                Nome (facoltativo)
                <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={60}
                    placeholder={`es. ${ROOM_TYPE_LABELS[roomType]} principale`}
                    className={cn(
                        'h-11 rounded-xl border border-luxury-gold/20 bg-luxury-bg/30 px-3',
                        'text-base text-luxury-text placeholder:text-luxury-text/40',
                        'focus:outline-none focus:ring-1 focus:ring-luxury-gold/40',
                    )}
                />
            </label>

            {error && (
                <p role="alert" className="text-sm text-red-400">
                    {error}
                </p>
            )}

            <Button type="submit" disabled={isSaving} className="h-11 rounded-full">
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Crea stanza
            </Button>
        </form>
    );
}
