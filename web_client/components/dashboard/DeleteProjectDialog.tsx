'use client';

import { useState } from 'react';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface DeleteProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectTitle: string;
    sessionId: string;
    onDelete: (sessionId: string) => Promise<void>;
}

export function DeleteProjectDialog({
    open,
    onOpenChange,
    projectTitle,
    sessionId,
    onDelete
}: DeleteProjectDialogProps) {
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const isValid = confirmText.toLowerCase() === 'cancella';

    const handleDelete = async () => {
        if (!isValid) return;

        setIsDeleting(true);
        try {
            await onDelete(sessionId);
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
            title="Elimina Progetto"
            description={`Stai per eliminare "${projectTitle}". Questa azione è permanente e rimuoverà tutti i dati associati.`}
            className="sm:max-w-[500px] bg-slate-900 border-slate-800"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.05, 0.7, 0.1, 1.0] }}
                className="space-y-4 py-2"
            >
                {/* Icon + Project Name */}
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-red-950/30 flex items-center justify-center border border-red-500/20 shrink-0">
                        <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                    <p className="text-slate-400 text-sm">
                        Rimuoverà <span className="font-semibold text-white">{projectTitle}</span> in modo{' '}
                        <span className="text-red-400 font-medium">permanente</span>:
                    </p>
                </div>

                {/* Warning List */}
                <ul className="space-y-2 text-sm text-slate-400 bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                    <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">•</span>
                        <span>Tutta la cronologia della chat</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">•</span>
                        <span>I dettagli del cantiere salvati</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">•</span>
                        <span>Tutti i metadati associati</span>
                    </li>
                </ul>

                {/* Confirmation Input */}
                <div className="space-y-2">
                    <Label htmlFor="confirm" className="text-sm text-slate-300">
                        Per confermare, scrivi{' '}
                        <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-red-400">cancella</span>:
                    </Label>
                    <Input
                        id="confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="cancella"
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 focus:border-red-500"
                        autoComplete="off"
                        disabled={isDeleting}
                    />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={isDeleting}
                        className="text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        Annulla
                    </Button>
                    <Button
                        onClick={handleDelete}
                        disabled={!isValid || isDeleting}
                        className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Eliminazione...
                            </>
                        ) : (
                            'Elimina Definitivamente'
                        )}
                    </Button>
                </div>
            </motion.div>
        </ResponsiveDrawer>
    );
}
