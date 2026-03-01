import React, { useState, useEffect } from 'react';
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

    // Auto-expand if risk is high or confidence is low
    useEffect(() => {
        if (reasoningData) {
            if (reasoningData.risk_score > 0.7 || reasoningData.confidence_score < 0.6) {
                setIsExpanded(true);
            }
        }
    }, [reasoningData]);

    const getRiskColor = (score: number) => {
        if (score < 0.3) return "text-green-400 bg-green-900/20 border-green-800";
        if (score < 0.7) return "text-yellow-400 bg-yellow-900/20 border-yellow-800";
        return "text-red-400 bg-red-900/20 border-red-800";
    };

    const getConfidenceColor = (score: number) => {
        if (score > 0.8) return "bg-green-500";
        if (score > 0.5) return "bg-yellow-500";
        return "bg-red-500";
    };

    const displayMessage = statusMessage || message || "Elaborazione in corso...";

    return (
        <div className="flex flex-col gap-2 min-w-[200px] max-w-full">
            {/* Header / Summary */}
            <div className="flex items-center justify-between gap-3 text-luxury-gold/80 text-sm h-8">
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
                                className="font-medium text-xs tracking-wide opacity-80 absolute top-0 left-0 truncate w-full"
                            >
                                {displayMessage}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                </div>

                {reasoningData && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 hover:bg-luxury-gold/10 rounded-full transition-colors"
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
                        <div className="mt-2 pt-2 border-t border-luxury-gold/10 space-y-3 text-xs">

                            {/* Analysis Block */}
                            <div className="bg-black/20 p-2 rounded border border-white/5">
                                <div className="text-white/50 mb-1 font-mono uppercase text-[10px]">Reasoning</div>
                                <div className="text-white/80 leading-relaxed font-light">
                                    {reasoningData.analysis}
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 gap-2">
                                {/* Confidence */}
                                <div className="bg-black/20 p-2 rounded border border-white/5 flex flex-col gap-1">
                                    <div className="text-white/50 text-[10px] uppercase flex items-center gap-1">
                                        <Zap size={10} /> Confidence
                                    </div>
                                    <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-1">
                                        <div
                                            className={cn("h-full transition-all duration-500", getConfidenceColor(reasoningData.confidence_score))}
                                            style={{ width: `${reasoningData.confidence_score * 100}%` }}
                                        />
                                    </div>
                                    <div className="text-right text-[10px] text-white/70">
                                        {Math.round(reasoningData.confidence_score * 100)}%
                                    </div>
                                </div>

                                {/* Risk */}
                                <div className={cn("p-2 rounded border flex flex-col gap-1", getRiskColor(reasoningData.risk_score))}>
                                    <div className="text-[10px] uppercase flex items-center gap-1 font-bold opacity-80">
                                        <ShieldCheck size={10} /> Risk Score
                                    </div>
                                    <div className="text-right text-[10px] font-mono">
                                        {reasoningData.risk_score.toFixed(2)} / 1.0
                                    </div>
                                </div>
                            </div>

                            {/* Intent Badge */}
                            <div className="flex justify-start">
                                <span className="px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-500/30 text-blue-300 text-[10px] uppercase tracking-wide">
                                    Intent: {reasoningData.intent_category?.replace('_', ' ') || 'Processing'}
                                </span>
                            </div>

                            {/* Criticism Warning */}
                            {reasoningData.criticism && (
                                <div className="bg-red-900/10 border border-red-500/20 p-2 rounded text-red-200/80 italic">
                                    <div className="flex items-center gap-1 mb-1 text-red-400 text-[10px] uppercase not-italic font-bold">
                                        <AlertTriangle size={10} /> Self-Correction
                                    </div>
                                    "{reasoningData.criticism}"
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

