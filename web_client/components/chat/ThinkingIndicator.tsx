import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReasoningStep } from '@/types/reasoning';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { M3LoaderShape } from './M3LoaderShape';

interface ThinkingIndicatorProps {
    message?: string;
    statusMessage?: string;
    reasoningData?: ReasoningStep | null; // The latest CoT step
}

export const ThinkingIndicator = ({ message, statusMessage, reasoningData }: ThinkingIndicatorProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [prevReasoningData, setPrevReasoningData] = useState<ReasoningStep | null | undefined>(reasoningData);

    // Adjust state when props change (Professional React Pattern instead of useEffect)
    if (reasoningData !== prevReasoningData) {
        setPrevReasoningData(reasoningData);
        if (reasoningData && (reasoningData.risk_score > 0.7 || reasoningData.confidence_score < 0.6)) {
            setIsExpanded(true);
        }
    }

    const getRiskColor = (score: number) => {
        if (score < 0.3) return "text-success-ink bg-success-subtle border-success";
        if (score < 0.7) return "text-warning-ink bg-warning-subtle border-warning";
        return "text-danger-ink bg-danger-subtle border-danger";
    };

    const getConfidenceColor = (score: number) => {
        if (score > 0.8) return "bg-success";
        if (score > 0.5) return "bg-warning";
        return "bg-danger";
    };

    const displayMessage = statusMessage || message || "Elaborazione in corso...";

    return (
        <div data-testid="thinking-indicator" className="flex flex-col gap-2 min-w-[200px] max-w-full">
            {/* Header / Summary */}
            <div className="flex items-center justify-between gap-3 text-primary-ink text-sm h-8">
                <div className="flex items-center gap-3">
                    <M3LoaderShape />
                    
                    <div className="relative overflow-hidden h-5 w-[240px]">
                        <AnimatePresence mode='wait'>
                            <motion.span 
                                key={displayMessage}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                                className="font-medium text-xs tracking-wide absolute top-0 left-0 truncate w-full"
                            >
                                {displayMessage}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                </div>

                {reasoningData && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 hover:bg-primary-subtle rounded-full transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                )}
            </div>

            {/* Expanded Reasoning Details */}
            <AnimatePresence>
                {isExpanded && reasoningData && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 pt-2 border-t border-line space-y-3 text-xs">

                            {/* Analysis Block */}
                            <div className="bg-surface-muted p-2 rounded border border-line">
                                <div className="text-ink-subtle mb-1 font-mono uppercase text-[10px]">Reasoning</div>
                                <div className="text-ink leading-relaxed font-light">
                                    {reasoningData.analysis}
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 gap-2">
                                {/* Confidence */}
                                <div className="bg-surface-muted p-2 rounded border border-line flex flex-col gap-1">
                                    <div className="text-ink-subtle text-[10px] uppercase flex items-center gap-1">
                                        <Zap size={10} /> Confidence
                                    </div>
                                    <div className="w-full bg-surface-muted h-1 rounded-full overflow-hidden mt-1">
                                        <div
                                            className={cn("h-full transition-all duration-500", getConfidenceColor(reasoningData.confidence_score))}
                                            style={{ width: `${reasoningData.confidence_score * 100}%` }}
                                        />
                                    </div>
                                    <div className="text-right text-[10px] text-ink-muted">
                                        {Math.round(reasoningData.confidence_score * 100)}%
                                    </div>
                                </div>

                                {/* Risk */}
                                <div className={cn("p-2 rounded border flex flex-col gap-1", getRiskColor(reasoningData.risk_score))}>
                                    <div className="text-[10px] uppercase flex items-center gap-1 font-bold">
                                        <ShieldCheck size={10} /> Risk Score
                                    </div>
                                    <div className="text-right text-[10px] font-mono">
                                        {reasoningData.risk_score.toFixed(2)} / 1.0
                                    </div>
                                </div>
                            </div>

                            {/* Intent Badge */}
                            <div className="flex justify-start">
                                <span className="px-2 py-0.5 rounded-full bg-info-subtle border border-info/30 text-info-ink text-[10px] uppercase tracking-wide">
                                    Intent: {reasoningData.intent_category?.replace('_', ' ') || 'Processing'}
                                </span>
                            </div>

                            {/* Criticism Warning */}
                            {reasoningData.criticism && (
                                <div className="bg-danger-subtle border border-danger/20 p-2 rounded text-danger-ink italic">
                                    <div className="flex items-center gap-1 mb-1 text-danger-ink text-[10px] uppercase not-italic font-bold">
                                        <AlertTriangle size={10} /> Self-Correction
                                    </div>
                                    &quot;{reasoningData.criticism}&quot;
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

