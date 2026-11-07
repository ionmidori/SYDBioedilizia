'use client';

import { useState } from 'react';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { SydLoader } from '@/components/ui/SydLoader';

interface DeleteAssetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    assetTitle: string;
    onDelete: () => Promise<void>;
}

export function DeleteAssetDialog({
    open,
    onOpenChange,
    assetTitle,
    onDelete
}: DeleteAssetDialogProps) {
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const isValid = confirmText.toLowerCase() === 'elimina';

    const handleDelete = async () => {
        if (!isValid) return;

        setIsDeleting(true);
        try {
            await onDelete();
            onOpenChange(false);
            setConfirmText('');
        } catch (error) {
            console.error('Delete failed:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleCancel = () => {
        setConfirmText('');
        onOpenChange(false);
    };

    return (
        <ResponsiveDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="Elimina File"
            description="Questa azione è permanente."
            className="sm:max-w-[400px] bg-canvas backdrop-blur-xl border-line"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4 py-2"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-danger-subtle flex items-center justify-center border border-danger/20 shrink-0">
                        <Trash2 className="w-5 h-5 text-danger-ink" />
                    </div>
                    <p className="text-ink-muted text-sm">
                        Stai per eliminare il file <span className="font-semibold text-ink">{assetTitle || 'selezionato'}</span>.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirm" className="text-xs text-ink-muted">
                        Scrivi <span className="font-mono bg-accent-subtle px-1.5 py-0.5 rounded text-danger-ink">elimina</span> per confermare:
                    </Label>
                    <Input
                        id="confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="elimina"
                        className="bg-surface-muted border-line text-ink placeholder:text-ink-muted focus:border-danger"
                        autoComplete="off"
                        disabled={isDeleting}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={isDeleting}
                        className="text-ink-muted hover:text-ink hover:bg-surface"
                    >
                        Annulla
                    </Button>
                    <Button
                        type="button"
                        onClick={handleDelete}
                        disabled={!isValid || isDeleting}
                        className="bg-danger-subtle hover:bg-danger/20 text-danger-ink border border-danger/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? <SydLoader size="sm" /> : 'Elimina File'}
                    </Button>
                </div>
            </motion.div>
        </ResponsiveDrawer>
    );
}
