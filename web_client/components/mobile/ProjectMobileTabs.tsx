'use client';

import { useCallback, useMemo } from 'react';
import { MessageSquare, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProjectFilesView } from '@/components/dashboard/ProjectFilesView';
import { ProjectSettingsView } from '@/components/dashboard/ProjectSettingsView';
import ChatWidget from '@/components/chat/ChatWidget';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { SwipeHints } from '@/components/mobile/MobileSwipeLayout';
import type { LucideIcon } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'chat' | 'files' | 'settings';
const TABS: TabId[] = ['chat', 'files', 'settings'];

interface ProjectMobileTabsProps {
    projectId: string;
}



// ─── Component ───────────────────────────────────────────────────────────────

export function ProjectMobileTabs({ projectId }: ProjectMobileTabsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // ── URL-synced tab state ─────────────────────────────────────────────────
    const activeTab = useMemo<TabId>(() => {
        const viewParam = searchParams.get('view') as TabId | null;
        return TABS.includes(viewParam as TabId) ? (viewParam as TabId) : 'chat';
    }, [searchParams]);

    const activeIndex = TABS.indexOf(activeTab);



    // ── Tab navigation (updates URL) ─────────────────────────────────────────
    const handleTabChange = useCallback(
        (tab: TabId) => {
            if (tab === activeTab) return;
            const newUrl = `/dashboard/${projectId}?view=${tab}`;
            router.replace(newUrl, { scroll: false });
        },
        [activeTab, projectId, router],
    );

    const handleSwipe = useCallback(
        (newIndex: number) => {
            const tab = TABS[newIndex];
            if (tab) handleTabChange(tab);
        },
        [handleTabChange],
    );

    // ── Exit: swipe right past first tab → go to projects list ──────────────
    const handleSwipePastStart = useCallback(() => {
        router.push('/dashboard/projects');
    }, [router]);

    // ── Swipe Navigation ─────────────────────────────────────────────────────
    const { containerProps, swipeX } = useSwipeNavigation({
        panes: [...TABS],
        activeIndex,
        onSwipe: handleSwipe,
        onSwipePastStart: handleSwipePastStart,
        swipeThreshold: 60,
        enableHaptics: true,
    });

    return (
        <div
            className="flex flex-col h-full w-full bg-luxury-bg relative overflow-hidden"
            style={{ touchAction: 'pan-y' }}
            {...containerProps}
        >
            {/* M3 Expressive Edge Swipe Indicators */}
            <SwipeHints
                activeIndex={activeIndex}
                totalPanes={TABS.length}
                swipeX={swipeX}
                hasExitGesture={true}
            />

            {/* Tab Content — all tabs stay mounted, only active is visible.
                This prevents ChatWidget's heavy Firebase teardown/setup from freezing the UI. */}
            <div className="flex-1 relative overflow-hidden min-h-0">
                {/* Chat Tab — always mounted, hidden when inactive */}
                <div className={cn(
                    "absolute inset-0 h-full w-full transition-opacity duration-200",
                    activeTab === 'chat' ? "opacity-100 z-10" : "opacity-0 z-0 hidden pointer-events-none"
                )}>
                    <ChatWidget projectId={projectId} variant="inline" />
                </div>

                {/* Files Tab — lazy-mounted on first visit, then stays mounted */}
                <div className={cn(
                    "absolute inset-0 h-full w-full overflow-y-auto transition-opacity duration-200",
                    activeTab === 'files' ? "opacity-100 z-10" : "opacity-0 z-0 hidden pointer-events-none"
                )}>
                    <ProjectFilesView projectId={projectId} />
                </div>

                {/* Settings Tab — lazy-mounted on first visit, then stays mounted */}
                <div className={cn(
                    "absolute inset-0 h-full w-full overflow-y-auto transition-opacity duration-200",
                    activeTab === 'settings' ? "opacity-100 z-10" : "opacity-0 z-0 hidden pointer-events-none"
                )}>
                    <ProjectSettingsView projectId={projectId} />
                </div>
            </div>
        </div>
    );
}

// ─── NavButton (REMOVED: Redundant with DashboardHeader) ─────────────────────
