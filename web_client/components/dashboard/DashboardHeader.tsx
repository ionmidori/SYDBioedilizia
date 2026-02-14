'use client';

import { User as UserIcon } from "lucide-react";
import { SydLogo } from "@/components/branding/SydLogo";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import NextImage from "next/image";
import { usePathname } from "next/navigation";
import { PaneIndicator, getActiveIndexFromPathname } from "@/components/mobile/MobileSwipeLayout";

export function DashboardHeader() {
    const { user } = useAuth();
    const pathname = usePathname();
    const activeIndex = getActiveIndexFromPathname(pathname);

    const initials = user?.displayName
        ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
        : user?.email ? user.email[0].toUpperCase() : 'U';

    return (
        <header className="md:hidden sticky top-0 z-30 w-full px-4 h-16 sm:h-20 flex items-center justify-between bg-luxury-bg/95 border-b border-luxury-gold/10 transition-all duration-300 pt-[env(safe-area-inset-top)]">
            {/* Left: SYD Logo */}
            <div className="flex-shrink-0">
                <Link href="/dashboard" className="block active:opacity-80 transition-opacity">
                    <SydLogo className="h-6 w-auto scale-[0.85] sm:scale-100 origin-left" showSubtitle={false} />
                </Link>
            </div>

            {/* Center: Pane Indicator */}
            <div className="flex-1 flex justify-center">
                <PaneIndicator activeIndex={activeIndex} />
            </div>
        </header>
    );
}
