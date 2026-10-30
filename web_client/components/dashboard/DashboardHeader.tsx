'use client';

import { SydLogo } from "@/components/branding/SydLogo";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    PaneIndicator,
    getActiveIndexFromPathname,
    MAIN_LABELS,
    PANE_ROUTES,
} from "@/components/mobile/MobileSwipeLayout";
import { HOUSE_TABS, houseTabFromView, houseTabHref } from "@/lib/house-tabs";

const HOUSE_TAB_LABELS = HOUSE_TABS.map((tab) => tab.label);

export function DashboardHeader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const mainIndex = getActiveIndexFromPathname(pathname);

    // The house (/dashboard) has its tabs on a second row.
    const isHouse = pathname === PANE_ROUTES[0];
    const houseTab = houseTabFromView(searchParams.get('view'));
    const houseTabIndex = HOUSE_TABS.findIndex((tab) => tab.id === houseTab);

    const handleMainIndexClick = (index: number) => {
        const route = PANE_ROUTES[index];
        if (route && index !== mainIndex) {
            router.push(route);
        }
    };

    const handleHouseTabClick = (index: number) => {
        const tab = HOUSE_TABS[index];
        if (tab && index !== houseTabIndex) {
            router.replace(houseTabHref(tab.id), { scroll: false });
        }
    };

    return (
        <header className="md:hidden sticky top-0 z-30 w-full px-4 bg-luxury-bg/90 backdrop-blur-md border-b border-luxury-gold/10 transition-all duration-300 pt-[env(safe-area-inset-top)]">
            <div className="h-14 flex items-center justify-between">
                {/* Left: SYD Logo */}
                <div className="flex-shrink-0">
                    <Link href="/" className="block active:opacity-80 transition-opacity">
                        <SydLogo className="h-6 w-auto scale-[0.85] sm:scale-100 origin-left" showSubtitle={false} />
                    </Link>
                </div>

                {/* Center: Main Pane Indicator */}
                <div className="flex-1 flex justify-center">
                    <PaneIndicator
                        activeIndex={mainIndex}
                        labels={MAIN_LABELS}
                        onIndexClick={handleMainIndexClick}
                    />
                </div>
            </div>

            {/* Second row: the tabs of the house (only in the house) */}
            {isHouse && (
                <div className="flex justify-center pb-1.5 -mt-1">
                    <PaneIndicator
                        activeIndex={houseTabIndex}
                        labels={HOUSE_TAB_LABELS}
                        size="small"
                        onIndexClick={handleHouseTabClick}
                    />
                </div>
            )}
        </header>
    );
}
