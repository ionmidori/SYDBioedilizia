'use client';

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProjectFilesView } from '@/components/dashboard/ProjectFilesView';
import { ProjectSettingsView } from '@/components/dashboard/ProjectSettingsView';
import ChatWidget from '@/components/chat/ChatWidget';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { MobileSwipeLayout, SwipeHints } from '@/components/mobile/MobileSwipeLayout';
import { createSlideVariants, M3Spring } from '@/lib/m3-motion';
import type { LucideIcon } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'chat' | 'files' | 'settings';
const TABS: TabId[] = ['chat', 'files', 'settings'];

interface ProjectMobileTabsProps {
    projectId: string;
}

// ─── Animation Variants ──────────────────────────────────────────────────────

const slideVariants = createSlideVariants(300);

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

    // Track direction for AnimatePresence
    const directionRef = useRef(0);
    const prevIndexRef = useRef(activeIndex);

    useEffect(() => {
        directionRef.current = activeIndex > prevIndexRef.current ? 1 : -1;
        prevIndexRef.current = activeIndex;
    }, [activeIndex]);

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
            className="flex flex-col h-[100dvh] w-full bg-luxury-bg relative overflow-hidden"
            {...containerProps}
        >
            {/* M3 Expressive Edge Swipe Indicators */}
            <SwipeHints
                activeIndex={activeIndex}
                totalPanes={TABS.length}
                swipeX={swipeX}
                hasExitGesture={true}
            />

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden touch-pan-y">
                <AnimatePresence
                    initial={false}
                    mode="wait"
                    custom={directionRef.current}
                >
                    <motion.div
                        key={activeTab}
                        className="absolute inset-0 h-full w-full"
                        custom={directionRef.current}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                    >
                        {activeTab === 'chat' && (
                            <div className="h-full w-full">
                                <ChatWidget projectId={projectId} variant="inline" />
                            </div>
                        )}
                        {activeTab === 'files' && (
                            <div className="h-full w-full overflow-y-auto">
                                <ProjectFilesView projectId={projectId} />
                            </div>
                        )}
                        {activeTab === 'settings' && (
                            <div className="h-full w-full overflow-y-auto">
                                <ProjectSettingsView projectId={projectId} />
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

        </div >
    );
}

// ─── NavButton (REMOVED: Redundant with DashboardHeader) ─────────────────────
