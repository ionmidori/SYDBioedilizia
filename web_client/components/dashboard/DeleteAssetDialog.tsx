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
            className="sm:max-w-[400px] bg-luxury-bg/95 backdrop-blur-xl border-luxury-gold/20"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4 py-2"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 shrink-0">
                        <Trash2 className="w-5 h-5 text-red-400" />
                    </div>
                    <p className="text-luxury-text/70 text-sm">
                        Stai per eliminare il file <span className="font-semibold text-luxury-text">{assetTitle || 'selezionato'}</span>.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirm" className="text-xs text-luxury-text/60">
                        Scrivi <span className="font-mono bg-luxury-gold/10 px-1.5 py-0.5 rounded text-red-400">elimina</span> per confermare:
                    </Label>
                    <Input
                        id="confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="elimina"
                        className="bg-black/20 border-luxury-gold/10 text-white placeholder:text-luxury-text/30 focus:border-red-500"
                        autoComplete="off"
                        disabled={isDeleting}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={isDeleting}
                        className="text-luxury-text/50 hover:text-luxury-text hover:bg-white/5"
                    >
                        Annulla
                    </Button>
                    <Button
                        type="button"
                        onClick={handleDelete}
                        disabled={!isValid || isDeleting}
                        className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? <SydLoader size="sm" /> : 'Elimina File'}
                    </Button>
                </div>
            </motion.div>
        </ResponsiveDrawer>
    );
}
