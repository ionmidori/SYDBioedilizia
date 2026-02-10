import { motion } from "framer-motion";

export function ChatSkeleton() {
    return (
        <div className="flex-1 w-full h-full flex flex-col p-4 space-y-6 overflow-hidden">
            {/* Incoming Message Skeleton */}
            <div className="flex gap-4 max-w-[80%]">
                <div className="w-8 h-8 rounded-full bg-luxury-gold/20 animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                    <div className="h-4 bg-luxury-gold/10 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-luxury-gold/5 rounded w-1/2 animate-pulse" />
                </div>
            </div>

            {/* Outgoing Message Skeleton */}
            <div className="flex gap-4 max-w-[80%] self-end flex-row-reverse">
                <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                    <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                </div>
            </div>

            {/* Incoming Message Skeleton (Longer) */}
            <div className="flex gap-4 max-w-[80%]">
                <div className="w-8 h-8 rounded-full bg-luxury-gold/20 animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                    <div className="h-4 bg-luxury-gold/10 rounded w-full animate-pulse" />
                    <div className="h-4 bg-luxury-gold/10 rounded w-5/6 animate-pulse" />
                    <div className="h-4 bg-luxury-gold/5 rounded w-2/3 animate-pulse" />
                </div>
            </div>

            {/* Center Loading Indicator */}
            <div className="flex-1 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="flex flex-col items-center gap-2"
                >
                    <div className="w-12 h-12 rounded-full border-2 border-luxury-gold/30 border-t-luxury-gold animate-spin" />
                    <span className="text-xs text-luxury-gold/60 tracking-widest uppercase">Syncing History</span>
                </motion.div>
            </div>
        </div>
    );
}
