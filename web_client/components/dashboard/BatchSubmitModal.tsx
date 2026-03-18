'use client';

import { useState } from 'react';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';
import { Send, FolderKanban, CheckCircle2, AlertCircle, TrendingDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SydLoader } from '@/components/ui/SydLoader';
import { ProjectListItem } from '@/types/projects';
import { batchApi, AggregationPreviewResponse } from '@/lib/batch-api';
import { M3Spring } from '@/lib/m3-motion';

interface BatchSubmitModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedProjects: ProjectListItem[];
    onSuccess: () => void;
}

type ModalStep = 'preview' | 'loading' | 'confirm' | 'submitting' | 'success';

export function BatchSubmitModal({
    open,
    onOpenChange,
    selectedProjects,
    onSuccess,
}: BatchSubmitModalProps) {
    const [step, setStep] = useState<ModalStep>('preview');
    const [batchId, setBatchId] = useState<string | null>(null);
    const [preview, setPreview] = useState<AggregationPreviewResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // When modal opens, create batch to get savings preview
    const handleOpen = async () => {
        if (selectedProjects.length === 0) return;

        setStep('loading');
        setError(null);

        try {
            const projectIds = selectedProjects.map((p) => p.session_id);
            const result = await batchApi.createWithPreview(projectIds);
            setBatchId(result.batch.batch_id);
            setPreview(result.preview);
            setStep('confirm');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore nel calcolo del preventivo');
            setStep('preview');
        }
    };

    // Submit the pre-created batch
    const handleSubmit = async () => {
        if (!batchId) return;

        setStep('submitting');
        setError(null);

        try {
            await batchApi.submitBatch(batchId);
            setStep('success');
            setTimeout(() => {
                resetAndClose();
                onSuccess();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore imprevisto');
            setStep('confirm');
        }
    };

    const resetAndClose = () => {
        setStep('preview');
        setBatchId(null);
        setPreview(null);
        setError(null);
        onOpenChange(false);
    };

    const handleClose = () => {
        if (step === 'submitting' || step === 'loading') return;
        resetAndClose();
    };

    // Auto-trigger batch creation when modal opens
    const handleOpenChange = (isOpen: boolean) => {
        if (isOpen && step === 'preview') {
            handleOpen();
        }
        if (!isOpen) {
            handleClose();
        }
    };

    const hasSavings = preview && preview.total_savings > 0;

    return (
        <ResponsiveDrawer
            open={open}
            onOpenChange={handleOpenChange}
            title="Richiedi Preventivo"
            description={`${selectedProjects.length} progett${selectedProjects.length === 1 ? 'o' : 'i'} selezionat${selectedProjects.length === 1 ? 'o' : 'i'}`}
            className="sm:max-w-[580px] bg-slate-900 border-slate-800"
        >
            <div
                className="space-y-5 py-2"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* Loading State */}
                <AnimatePresence mode="wait">
                    {step === 'loading' && (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center gap-4 py-12"
                        >
                            <SydLoader size="lg" />
                            <p className="text-sm text-slate-400 font-medium">
                                Calcolo ottimizzazioni cross-progetto...
                            </p>
                        </motion.div>
                    )}

                    {/* Success State */}
                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={M3Spring.bouncy}
                            className="flex flex-col items-center gap-4 py-8"
                        >
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-white">Richiesta Inviata</p>
                                <p className="text-sm text-slate-400 mt-1">
                                    Il nostro team ti contatterà con la stima definitiva.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* Confirm State (with preview) */}
                    {(step === 'confirm' || step === 'submitting' || step === 'preview') && (
                        <motion.div
                            key="confirm"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.05, 0.7, 0.1, 1.0] }}
                            className="space-y-5"
                        >
                            {/* Project List */}
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
                                    Progetti inclusi
                                </p>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                    {selectedProjects.map((project) => (
                                        <div
                                            key={project.session_id}
                                            className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800"
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-luxury-teal/10 flex items-center justify-center border border-luxury-teal/20 shrink-0">
                                                <FolderKanban className="w-4 h-4 text-luxury-teal" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">
                                                    {project.title}
                                                </p>
                                                <p className="text-[11px] text-slate-500">
                                                    {project.status === 'quoted' ? 'Preventivo pronto' : 'Bozza preventivo'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Savings Preview */}
                            {hasSavings && preview && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    transition={M3Spring.standard}
                                    className="overflow-hidden"
                                >
                                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles className="w-4 h-4 text-emerald-400" />
                                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                                                Risparmio combinato
                                            </p>
                                        </div>

                                        {/* Savings summary */}
                                        <div className="flex items-baseline gap-2 mb-4">
                                            <span className="text-2xl font-bold text-emerald-400">
                                                -€{preview.total_savings.toFixed(0)}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                di possibile risparmio
                                            </span>
                                        </div>

                                        {/* Adjustment details */}
                                        <div className="space-y-2">
                                            {preview.adjustments.map((adj, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-start gap-2 text-xs"
                                                >
                                                    <TrendingDown className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                                    <div className="flex-1">
                                                        <span className="text-slate-300">{adj.description}</span>
                                                        <span className="text-emerald-400 font-bold ml-2">
                                                            -€{adj.savings.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* No savings note */}
                            {preview && !hasSavings && (
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-luxury-teal/5 border border-luxury-teal/15">
                                    <Send className="w-4 h-4 text-luxury-teal mt-0.5 shrink-0" />
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Ogni progetto verrà valutato singolarmente dal nostro team.
                                        Riceverai una notifica quando la stima sarà pronta.
                                    </p>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="ghost"
                                    onClick={handleClose}
                                    disabled={step === 'submitting'}
                                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                                >
                                    Annulla
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={step === 'submitting' || !batchId}
                                    className="bg-luxury-teal/20 hover:bg-luxury-teal/30 text-luxury-teal border border-luxury-teal/30 hover:border-luxury-teal/50 flex items-center gap-2 font-bold"
                                >
                                    {step === 'submitting' ? (
                                        <>
                                            <SydLoader size="sm" />
                                            Invio in corso...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Conferma e Invia
                                        </>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ResponsiveDrawer>
    );
}
