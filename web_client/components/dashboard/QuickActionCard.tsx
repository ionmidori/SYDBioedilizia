'use client';

import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuickActionCardProps {
    icon: LucideIcon;
    label: string;
    description?: string;
    badge?: string;
    onClick: () => void;
    className?: string;
}

export function QuickActionCard({
    icon: Icon,
    label,
    description,
    badge,
    onClick,
    className
}: QuickActionCardProps) {
    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={cn(
                "group relative overflow-hidden rounded-2xl border border-luxury-gold/10 bg-luxury-bg/50 backdrop-blur-xl p-5 transition-all duration-300 text-left w-full",
                "hover:border-luxury-gold/30 hover:shadow-lg hover:shadow-luxury-gold/10",
                className
            )}
        >
            {/* Background Animation */}
            <div className="absolute inset-0 bg-gradient-to-br from-luxury-gold/0 via-luxury-gold/0 to-luxury-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Content */}
            <div className="relative flex items-start gap-4">
                {/* Icon */}
                <div className="p-3 rounded-xl bg-luxury-gold/10 border border-luxury-gold/20 group-hover:bg-luxury-gold/20 transition-colors shrink-0">
                    <Icon className="w-6 h-6 text-luxury-gold" />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-luxury-text text-sm tracking-tight">
                            {label}
                        </h3>
                        {badge && (
                            <span className="px-2 py-0.5 rounded-full bg-luxury-teal/20 text-luxury-teal text-[10px] font-bold uppercase tracking-wider">
                                {badge}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="text-xs text-luxury-text/50 leading-relaxed">
                            {description}
                        </p>
                    )}
                </div>
            </div>

            {/* Arrow Indicator */}
            <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1">
                <svg className="w-4 h-4 text-luxury-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </div>
        </motion.button>
    );
}
