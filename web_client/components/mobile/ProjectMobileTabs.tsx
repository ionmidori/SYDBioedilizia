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
            className="flex flex-col h-full w-full bg-luxury-bg relative overflow-hidden"
            {...containerProps}
        >
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
                        style={{ x: swipeX }}
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

            {/* Bottom Navigation Bar with M3 Pill Indicator */}
            <div className="h-16 bg-luxury-bg/80 backdrop-blur-lg border-t border-luxury-gold/10 flex items-center justify-around px-2 z-20 pb-safe relative">
                {/* Animated Pill Indicator */}
                <motion.div
                    className="absolute top-0 h-0.5 bg-luxury-gold rounded-full"
                    animate={{
                        left: `${(activeIndex / TABS.length) * 100 + 100 / TABS.length / 2 - 8}%`,
                        width: 48,
                    }}
                    transition={M3Spring.expressive}
                />
                <NavButton
                    active={activeTab === 'chat'}
                    onClick={() => handleTabChange('chat')}
                    icon={MessageSquare}
                    label="Chat"
                />
                <NavButton
                    active={activeTab === 'files'}
                    onClick={() => handleTabChange('files')}
                    icon={FileText}
                    label="Files"
                />
                <NavButton
                    active={activeTab === 'settings'}
                    onClick={() => handleTabChange('settings')}
                    icon={Settings}
                    label="Settings"
                />
            </div>
        </div>
    );
}

// ─── NavButton ───────────────────────────────────────────────────────────────

interface NavButtonProps {
    active: boolean;
    onClick: () => void;
    icon: LucideIcon;
    label: string;
}

function NavButton({ active, onClick, icon: Icon, label }: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-300 w-16",
                active ? "text-luxury-gold bg-luxury-gold/5" : "text-luxury-text/40 hover:text-luxury-text/60"
            )}
        >
            <Icon className={cn("w-6 h-6 mb-1", active && "fill-current")} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </button>
    );
}
