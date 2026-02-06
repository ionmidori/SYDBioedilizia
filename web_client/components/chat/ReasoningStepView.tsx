'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Brain, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReasoningStep } from '@/types/chat';

interface ReasoningStepViewProps {
    reasoning: ReasoningStep | string;
    defaultExpanded?: boolean;
}

/**
 * ReasoningStepView Component
 * 
 * Displays the AI's Chain of Thought (CoT) reasoning in a collapsible
 * accordion panel. Matches the Luxury Tech design system.
 */
export function ReasoningStepView({ reasoning, defaultExpanded = false }: ReasoningStepViewProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    // Handle both string and structured reasoning
    const isStructured = typeof reasoning !== 'string';
    const step = isStructured ? reasoning : null;
    const analysisText = isStructured ? step?.analysis : reasoning;

    // Status badge color mapping
    const statusColors = {
        continue: 'bg-luxury-teal/20 text-luxury-teal border-luxury-teal/30',
        pause: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        complete: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    };

    // Confidence level indicator
    const getConfidenceColor = (score: number) => {
        if (score >= 0.8) return 'bg-emerald-500';
        if (score >= 0.5) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <div className="mb-2">
            {/* Collapsible Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg",
                    "bg-luxury-gold/10 border border-luxury-gold/20",
                    "hover:bg-luxury-gold/15 transition-all duration-200",
                    "text-sm text-luxury-gold"
                )}
            >
                <Brain className="w-4 h-4" />
                <span className="font-medium">Ragionamento AI</span>

                {/* Status Badge (if structured) */}
                {step?.protocol_status && (
                    <span className={cn(
                        "ml-2 px-2 py-0.5 text-xs rounded-full border",
                        statusColors[step.protocol_status]
                    )}>
                        {step.protocol_status === 'continue' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
                        {step.protocol_status === 'pause' && <AlertCircle className="w-3 h-3 inline mr-1" />}
                        {step.protocol_status === 'complete' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {step.protocol_status}
                    </span>
                )}

                {/* Confidence Score (if structured) */}
                {step?.confidence_score !== undefined && (
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-luxury-text/60">
                            {Math.round(step.confidence_score * 100)}%
                        </span>
                        <div className="w-12 h-1.5 bg-luxury-bg rounded-full overflow-hidden">
                            <div
                                className={cn("h-full transition-all", getConfidenceColor(step.confidence_score))}
                                style={{ width: `${step.confidence_score * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                <ChevronDown className={cn(
                    "w-4 h-4 ml-auto transition-transform duration-200",
                    isExpanded && "rotate-180"
                )} />
            </button>

            {/* Expandable Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className={cn(
                            "mt-1 p-3 rounded-lg",
                            "bg-luxury-bg/50 border border-luxury-gold/10",
                            "text-sm text-luxury-text/80"
                        )}>
                            {/* Analysis Text */}
                            {analysisText && (
                                <p className="leading-relaxed whitespace-pre-wrap">
                                    {analysisText}
                                </p>
                            )}

                            {/* Action & Tool (if structured) */}
                            {step?.action && (
                                <div className="mt-3 pt-3 border-t border-luxury-gold/10 flex flex-wrap gap-2">
                                    <span className="px-2 py-1 text-xs rounded bg-luxury-teal/20 text-luxury-teal">
                                        {step.action}
                                    </span>
                                    {step.tool_name && (
                                        <span className="px-2 py-1 text-xs rounded bg-purple-500/20 text-purple-400">
                                            {step.tool_name}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Missing Info (if any) */}
                            {step?.missing_info && step.missing_info.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-luxury-gold/10">
                                    <p className="text-xs text-amber-400 mb-1 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        Informazioni mancanti:
                                    </p>
                                    <ul className="text-xs text-luxury-text/60 list-disc list-inside">
                                        {step.missing_info.map((info, idx) => (
                                            <li key={idx}>{info}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
