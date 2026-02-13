'use client';

import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatCardProps {
    icon: LucideIcon;
    label: string;
    value: number | string;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
    isLoading?: boolean;
}

export function StatCard({
    icon: Icon,
    label,
    value,
    trend,
    className,
    isLoading = false
}: StatCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
                "group relative overflow-hidden rounded-2xl border border-luxury-gold/15 bg-luxury-bg/80 backdrop-blur-xl p-6 transition-all duration-300 shadow-sm",
                "hover:border-luxury-gold/30 hover:shadow-lg hover:shadow-luxury-gold/5",
                className
            )}
        >
            {/* Background Glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-luxury-gold/5 rounded-full blur-3xl transition-opacity duration-500 opacity-0 group-hover:opacity-100" />

            {/* Icon */}
            <div className="relative flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-luxury-gold/10 border border-luxury-gold/20 group-hover:bg-luxury-gold/20 transition-colors">
                    <Icon className="w-6 h-6 text-luxury-gold" />
                </div>

                {trend && !isLoading && (
                    <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold",
                        trend.isPositive
                            ? "bg-green-500/10 text-green-400"
                            : "bg-red-500/10 text-red-400"
                    )}>
                        <span>{trend.isPositive ? '↑' : '↓'}</span>
                        <span>{Math.abs(trend.value)}%</span>
                    </div>
                )}
            </div>

            {/* Value & Label */}
            <div className="relative space-y-1">
                {isLoading ? (
                    <div className="space-y-2">
                        <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
                    </div>
                ) : (
                    <>
                        <p className="text-3xl font-bold text-luxury-text tracking-tight drop-shadow-sm">
                            {typeof value === 'number' ? value.toLocaleString('it-IT') : value}
                        </p>
                        <p className="text-sm font-semibold text-luxury-text/75 uppercase tracking-wider">
                            {label}
                        </p>
                    </>
                )}
            </div>

            {/* Decorative Line */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold/20 to-luxury-gold/0 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
        </motion.div>
    );
}
