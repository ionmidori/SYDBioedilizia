'use client';

import { SydLogo } from "@/components/branding/SydLogo";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
    PaneIndicator,
    getActiveIndexFromPathname,
    getProjectIdFromPathname,
    getProjectSubpageIndex,
    MAIN_LABELS,
    SUBPAGE_LABELS,
} from "@/components/mobile/MobileSwipeLayout";

export function DashboardHeader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const mainIndex = getActiveIndexFromPathname(pathname);

    // Detect project context
    const projectId = getProjectIdFromPathname(pathname);
    const isInsideProject = projectId !== null;
    const subpageIndex = isInsideProject
        ? getProjectSubpageIndex(pathname, searchParams.get('view'))
        : 0;

    return (
        <header className="md:hidden sticky top-0 z-30 w-full px-4 bg-luxury-bg/95 transition-all duration-300 pt-[env(safe-area-inset-top)]">
            <div className="h-14 flex items-center justify-between">
                {/* Left: SYD Logo */}
                <div className="flex-shrink-0">
                    <Link href="/" className="block active:opacity-80 transition-opacity">
                        <SydLogo className="h-6 w-auto scale-[0.85] sm:scale-100 origin-left" showSubtitle={false} />
                    </Link>
                </div>

                {/* Center: Main Pane Indicator */}
                <div className="flex-1 flex justify-center">
                    <PaneIndicator activeIndex={mainIndex} labels={MAIN_LABELS} />
                </div>
            </div>

            {/* Second row: Project subpage indicator (only when inside a project) */}
            {isInsideProject && (
                <div className="flex justify-center pb-1.5 -mt-1">
                    <PaneIndicator activeIndex={subpageIndex} labels={SUBPAGE_LABELS} size="small" />
                </div>
            )}
        </header>
    );
}
