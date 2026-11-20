'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Bath, BedDouble, CookingPot, DoorOpen, House, LayoutGrid, Loader2, Plus, Sofa, type LucideIcon } from 'lucide-react';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';
import { roomsApi } from '@/lib/rooms-api';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { RoomChip } from '@/hooks/useProjectRooms';
import type { RoomViewFilter } from '@/lib/chat/room-filter';
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
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
);

interface RoomChipsProps {
    projectId: string;
    rooms: RoomChip[];
    activeRoomId: string | null;
    /** Currently selected view filter (`'all'` or `room_id`). Defaults to `activeRoomId ?? 'all'`. */
    viewFilter?: RoomViewFilter;
    /** Optional per-room message counts for subtle badge display. */
    roomMessageCounts?: ReadonlyMap<string, number>;
    onSelect: (roomId: string) => void;
    /** Optional view-filter callback; if provided, renders the leading "Tutte" chip. */
    onSelectFilter?: (filter: RoomViewFilter) => void;
}

/**
 * Room chips above the composer (Phase 138: one chat for the whole home).
 *
 * When `onSelectFilter` is supplied, a leading "Tutte" chip widens the chat to
 * every message in the project, while tapping a room filters the visible thread
 * to that room AND makes it the active target for new messages/uploads.
 * Horizontal scroll on mobile, 44px touch targets.
 */
export function RoomChips({
    projectId,
    rooms,
    activeRoomId,
    viewFilter,
    roomMessageCounts,
    onSelect,
    onSelectFilter,
}: RoomChipsProps) {
    const [isCreating, setIsCreating] = useState(false);
    const effectiveFilter: RoomViewFilter = viewFilter ?? activeRoomId ?? 'all';

    const handleRoomClick = (roomId: string) => {
        if (onSelectFilter) {
            onSelectFilter(roomId);
        } else {
            onSelect(roomId);
        }
    };

    return (
        <div
            className="flex gap-2 overflow-x-auto scrollbar-hide snap-x px-4 pt-2 pb-1 flex-shrink-0"
            role="toolbar"
            aria-label="Stanze del progetto"
        >
            {onSelectFilter && (
                <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelectFilter('all')}
                    aria-pressed={effectiveFilter === 'all'}
                    className={cn(
                        CHIP_CLASS,
                        effectiveFilter === 'all'
                            ? 'bg-primary text-on-primary border-primary'
                            : 'bg-surface text-ink border-line hover:border-primary hover:bg-primary-subtle/50',
                    )}
                >
                    <LayoutGrid className="w-4 h-4" aria-hidden="true" />
                    <span>Tutte</span>
                </motion.button>
            )}
            {rooms.map((room) => {
                const Icon = ROOM_TYPE_ICONS[room.room_type];
                const isSelected = effectiveFilter === room.room_id;
                const isSendTargetWhileAll = effectiveFilter === 'all' && room.room_id === activeRoomId;
                const count = roomMessageCounts?.get(room.room_id) ?? 0;
                const ariaParts = [room.label];
                if (count > 0) ariaParts.push(count === 1 ? '1 messaggio' : `${count} messaggi`);
                if (isSendTargetWhileAll) ariaParts.push('stanza attiva per i nuovi messaggi');
                return (
                    <motion.button
                        key={room.room_id}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRoomClick(room.room_id)}
                        aria-pressed={isSelected}
                        aria-label={ariaParts.join(', ')}
                        title={isSendTargetWhileAll ? 'Stanza attiva per i nuovi messaggi' : undefined}
                        className={cn(
                            CHIP_CLASS,
                            isSelected
                                ? 'bg-primary text-on-primary border-primary'
                                : isSendTargetWhileAll
                                    ? 'bg-primary-subtle/40 text-ink border-primary/50 hover:border-primary'
                                    : 'bg-surface text-ink border-line hover:border-primary hover:bg-primary-subtle/50',
                        )}
                    >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span className="max-w-[10rem] truncate">{room.label}</span>
                        {count > 0 && (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'text-xs tabular-nums leading-none px-1.5 py-0.5 rounded-full font-semibold',
                                    isSelected
                                        ? 'bg-canvas text-primary-ink'
                                        : 'bg-line/60 text-ink-muted',
                                )}
                            >
                                {count}
                            </span>
                        )}
                    </motion.button>
                );
            })}
            <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsCreating(true)}
                className={cn(
                    CHIP_CLASS,
                    'border-dashed border-primary/50 text-primary-ink hover:bg-primary-subtle',
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
                            handleRoomClick(roomId);
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
                <legend className="text-sm text-ink-muted mb-2">Tipo di stanza</legend>
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
                                    ? 'bg-accent text-on-accent border-accent'
                                    : 'text-ink border-line hover:border-accent',
                            )}
                        >
                            <Icon className="w-4 h-4" aria-hidden="true" />
                            {ROOM_TYPE_LABELS[type]}
                        </button>
                    );
                })}
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
                Nome (facoltativo)
                <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={60}
                    placeholder={`es. ${ROOM_TYPE_LABELS[roomType]} principale`}
                    className={cn(
                        'h-11 rounded-xl border border-line bg-canvas/30 px-3',
                        'text-base text-ink placeholder:text-ink-muted',
                        'focus:outline-hidden focus:ring-1 focus:ring-ring',
                    )}
                />
            </label>

            {error && (
                <p role="alert" className="text-sm text-danger-ink">
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
