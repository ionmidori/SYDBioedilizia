'use client';

import { Menu, User as UserIcon } from "lucide-react";
import { useSidebar } from "@/components/dashboard/SidebarProvider";
import { SydLogo } from "@/components/branding/SydLogo";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import NextImage from "next/image";

export function DashboardHeader() {
    const { setOpenMobile } = useSidebar();
    const { user } = useAuth();

    const initials = user?.displayName
        ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
        : user?.email ? user.email[0].toUpperCase() : 'U';

    return (
        <header className="md:hidden sticky top-0 z-30 w-full px-4 h-16 sm:h-20 flex items-center justify-between bg-luxury-bg/95 border-b border-luxury-gold/10 transition-all duration-300 pt-[env(safe-area-inset-top)]">
            {/* Left: Hamburger Trigger - Optimized for touch (44px hit area) */}
            {/* Left: Spacer (was Hamburger) */}
            <div className="w-10" />

            {/* Center: SYD Logo */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[60%]">
                <Link href="/dashboard" className="block active:opacity-80 transition-opacity">
                    <SydLogo className="h-6 w-auto scale-[0.85] sm:scale-100 origin-center" showSubtitle={false} />
                </Link>
            </div>

            {/* Right: User Profile Link - Optimized for touch (44px hit area) */}
            <Link href="/dashboard/profile" className="relative group active:scale-95 transition-transform p-2 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2">
                <div className="relative">
                    {/* Ring glow effect */}
                    <div className="absolute -inset-0.5 bg-gradient-to-tr from-luxury-gold/40 to-transparent rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />

                    {user?.photoURL ? (
                        <NextImage
                            src={user.photoURL}
                            alt="Profile"
                            width={32}
                            height={32}
                            className="rounded-full border border-luxury-gold/20 relative z-10"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-luxury-gold/10 border border-luxury-gold/20 flex items-center justify-center text-luxury-gold text-xs font-bold relative z-10">
                            {initials}
                        </div>
                    )}
                </div>
            </Link>
        </header>
    );
}
