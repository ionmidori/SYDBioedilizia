"use client";

import { useEffect, useLayoutEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ClearChatDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roomLabel: string | null;
    isClearing: boolean;
    errorMessage: string | null;
    onConfirm: () => void;
}

const REASSURANCE_ICON = (
    <ShieldCheck className="w-4 h-4 shrink-0 text-primary-ink mt-0.5" aria-hidden="true" />
);

const REASSURANCE_TEXT =
    'Foto, render e preventivi restano sempre salvi nella tua Area Personale.';

/**
 * Accessible confirmation modal for clearing the full chat or restarting a single room thread.
 */
export function ClearChatDialog({
    open,
    onOpenChange,
    roomLabel,
    isClearing,
    errorMessage,
    onConfirm,
}: ClearChatDialogProps) {
    const scopedRoomLabel = roomLabel && roomLabel.trim().length > 0 ? roomLabel : null;
    const title = scopedRoomLabel
        ? `Ricominciare la chat di ${scopedRoomLabel}?`
        : 'Pulire tutta la chat?';
    const description = scopedRoomLabel
        ? `I messaggi della stanza ${scopedRoomLabel} verranno rimossi dalla conversazione per permetterti di ripartire da zero.`
        : 'Tutti i messaggi della chat verranno rimossi per permetterti di iniziare una nuova conversazione.';
    const confirmIdleLabel = scopedRoomLabel ? 'Ricomincia stanza' : 'Pulisci chat';
    const confirmLabel = isClearing ? 'Pulizia in corso…' : confirmIdleLabel;

    const openerRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);

    // Controlled Radix Dialog without <DialogTrigger> leaves Radix's internal triggerRef null,
    // so capture the opener before FocusScope moves focus in and restore it after FocusScope
    // tears down its focusin trap when the modal closes.
    useLayoutEffect(() => {
        if (open && !wasOpenRef.current) {
            openerRef.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }
        wasOpenRef.current = open;
    }, [open]);

    useEffect(() => {
        if (!open) return;
        return () => {
            const opener = openerRef.current;
            openerRef.current = null;
            if (opener && opener.isConnected) {
                opener.focus();
            }
        };
    }, [open]);

    const handleOpenChange = (next: boolean) => {
        if (!isClearing) {
            onOpenChange(next);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="sm:max-w-md bg-surface border-line text-ink rounded-2xl"
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                }}
                onEscapeKeyDown={(e) => {
                    if (isClearing) e.preventDefault();
                }}
                onPointerDownOutside={(e) => {
                    if (isClearing) e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-2.5 rounded-xl bg-surface-muted border border-line p-3 text-sm text-ink leading-snug">
                    {REASSURANCE_ICON}
                    <p>{REASSURANCE_TEXT}</p>
                </div>

                {errorMessage ? (
                    <div
                        role="alert"
                        className="rounded-xl bg-danger-subtle border border-danger/30 px-3 py-2.5 text-sm text-danger-ink"
                    >
                        {errorMessage}
                    </div>
                ) : null}

                <DialogFooter className="gap-2 sm:space-x-0">
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={isClearing}
                        onClick={() => onOpenChange(false)}
                    >
                        Annulla
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        disabled={isClearing}
                        aria-busy={isClearing}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
