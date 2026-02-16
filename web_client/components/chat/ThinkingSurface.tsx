"use client";

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Bot, Paintbrush, Calculator, FileSearch, CheckCircle2, AlertCircle, Search } from 'lucide-react';

/**
 * ThinkingSurface - Minimalist Edition
 * 
 * A clean, typographic-focused feedback surface.
 * Removes heavy glass effects and shimmers in favor of subtle, high-quality motion.
 */

interface ThinkingSurfaceProps {
    statusMessage?: string;
    data?: any[]; // CoT stream data
    layoutId?: string;
}

// Ultra-smooth, understated spring
const minimalSpring = {
    type: "spring",
    stiffness: 400,
    damping: 40,
    mass: 1
};

export function ThinkingSurface({ statusMessage, data, layoutId = "thinking-surface" }: ThinkingSurfaceProps) {
    const lastTool = data?.findLast((item: any) => item.type === 'tool_start');
    const isToolActive = !!lastTool;
    const isError = statusMessage?.toLowerCase().includes('error') || statusMessage?.toLowerCase().includes('fail');
    const isSuccess = statusMessage?.toLowerCase().includes('complete') || statusMessage?.toLowerCase().includes('done');

    // Icon Mapping - Keeping it simple and monochromatic
    const getIcon = () => {
        if (isError) return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
        if (isSuccess) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;

        switch (lastTool?.tool) {
            case 'generate_image': return <Paintbrush className="w-3.5 h-3.5 opacity-80" />;
            case 'search_web': return <Search className="w-3.5 h-3.5 opacity-80" />;
            case 'calculate_budget': return <Calculator className="w-3.5 h-3.5 opacity-80" />;
            case 'pdf_extract': return <FileSearch className="w-3.5 h-3.5 opacity-80" />;
            default: return <Bot className="w-3.5 h-3.5 opacity-80" />;
        }
    };

    const getText = () => {
        if (isToolActive) return `Running ${lastTool.tool}...`;
        return statusMessage || "Thinking...";
    };

    return (
        <motion.div
            layoutId={layoutId}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={minimalSpring}
            className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-full",
                // Minimalist container: Subtle border, very light background (or dark in dark mode)
                "bg-luxury-bg/40 border border-luxury-gold/10",
                "backdrop-blur-sm" // Reduced blur for cleaner look
            )}
        >
            {/* Simple Pulsing Icon */}
            <motion.div
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={minimalSpring}
                className="flex items-center justify-center text-luxury-gold/80"
            >
                {getIcon()}
            </motion.div>

            {/* Clean Typography */}
            <motion.div
                layout
                className="flex items-center"
            >
                <motion.span
                    key={getText()} // Text Swap
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-medium text-luxury-gold/70 tracking-wide font-sans scroll-m-20"
                >
                    {getText()}
                </motion.span>
            </motion.div>

            {/* Micro-Progress (Optional: Just a subtle dot instead of steps count) */}
            {data && data.length > 0 && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-1 h-1 rounded-full bg-luxury-gold/30 ml-1"
                />
            )}
        </motion.div>
    );
}
