import { Loader2 } from 'lucide-react';

export default function Loading() {
    return (
        <div className="flex flex-col space-y-10 py-8 px-6 md:px-8 max-w-7xl mx-auto w-full relative min-h-[50vh]">
            {/* Header Skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 border-b border-luxury-gold/5 pb-10">
                <div className="space-y-4">
                    <div className="h-12 w-64 bg-white/5 rounded-xl animate-pulse" />
                    <div className="h-6 w-96 bg-white/5 rounded-lg animate-pulse delay-100" />
                </div>
                <div className="h-14 w-48 bg-white/5 rounded-2xl animate-pulse" />
            </div>

            {/* Content Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                        key={i}
                        className="aspect-[4/5] rounded-[1.5rem] bg-white/5 border border-white/5 relative overflow-hidden"
                    >
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />

                        <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10" />
                        <div className="absolute bottom-20 left-4 right-4 h-6 w-3/4 bg-white/10 rounded-md" />
                        <div className="absolute bottom-12 left-4 right-4 h-4 w-1/2 bg-white/5 rounded-md" />
                    </div>
                ))}
            </div>
        </div>
    );
}
