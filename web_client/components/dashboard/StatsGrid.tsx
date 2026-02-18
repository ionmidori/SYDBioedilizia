import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface StatProps {
    label: string;
    value: string | number;
    icon?: LucideIcon;
    isLoading?: boolean;
}

export function StatsGrid({ stats, isLoading }: { stats: StatProps[], isLoading: boolean }) {
    return (
        <div
            className="w-full grid gap-2 overflow-hidden"
            style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
        >
            {stats.map((stat, index) => (
                <div key={index} className="min-w-0 w-full relative">
                    <StatCard {...stat} isLoading={isLoading} index={index} />
                </div>
            ))}
        </div>
    );
}

function StatCard({ label, value, icon: Icon, isLoading, index }: StatProps & { index: number }) {
    return (
        <div
            className="group relative flex items-center justify-between px-3 py-2 rounded-xl bg-luxury-teal/10 md:bg-luxury-teal/5 border border-luxury-teal/40 md:border-luxury-teal/20 hover:border-luxury-teal/50 hover:bg-luxury-teal/10 transition-all duration-300 backdrop-blur-md shadow-sm w-full"
        >
            {/* Background Glow - Persistent on mobile, Hover on desktop */}
            <div className="absolute inset-0 bg-gradient-to-r from-luxury-teal/0 via-luxury-teal/10 md:via-luxury-teal/0 md:group-hover:via-luxury-teal/10 transition-all duration-500 rounded-xl" />

            <div className="flex items-center gap-2 z-10 w-full min-w-0">
                {/* Value - Prominent */}
                {isLoading ? (
                    <div className="h-5 w-8 bg-luxury-text/10 rounded animate-pulse" />
                ) : (
                    <span className="text-base font-serif font-bold text-luxury-teal leading-none shrink-0">
                        {value}
                    </span>
                )}

                {/* Divider */}
                <div className="h-4 w-px bg-luxury-teal/20 shrink-0" />

                {/* Label - Truncated */}
                <span className="text-[9px] uppercase tracking-wider text-luxury-text/60 font-semibold truncate min-w-0 flex-1 text-left">
                    {label}
                </span>
            </div>
        </div>
    );
}
