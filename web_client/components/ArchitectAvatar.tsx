import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function ArchitectAvatar({ className }: { className?: string }) {
    return (
        <div className={cn("relative w-12 h-12 shadow-sm group flex items-center justify-center bg-luxury-bg rounded-full overflow-hidden border border-luxury-gold/30", className)}>
            {/* @ts-expect-error: Next.js 15 types mismatch with React 18 (bigint) */}
            <Image
                src="/assets/syd_luxury_avatar_light.png"
                alt="SYD Avatar"
                fill
                sizes="128px"
                className="object-cover scale-100 transition-transform duration-500 group-hover:scale-110"
                priority
            />
        </div>
    );
}

