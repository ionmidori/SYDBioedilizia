import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function ArchitectAvatar({ className }: { className?: string }) {
    return (
        <div className={cn("relative w-12 h-12 shadow-sm group flex items-center justify-center bg-luxury-bg rounded-full overflow-hidden border border-luxury-gold/30", className)}>
            <Image
                src="/assets/syd_avatar_final_v2.jpg"
                alt="SYD Avatar"
                fill
                sizes="128px"
                className="object-cover scale-110 transition-transform duration-500 group-hover:scale-125"
                priority
            />
        </div>
    );
}

