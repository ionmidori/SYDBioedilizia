'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProjectFilesView } from '@/components/dashboard/ProjectFilesView';
import { ProjectSettingsView } from '@/components/dashboard/ProjectSettingsView';
import ChatWidget from '@/components/chat/ChatWidget';

type TabId = 'chat' | 'files' | 'settings';

interface ProjectMobileTabsProps {
    projectId: string;
}

export function ProjectMobileTabs({ projectId }: ProjectMobileTabsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Validate view param, default to 'chat'
    const viewParam = searchParams.get('view');
    const validViews: TabId[] = ['chat', 'files', 'settings'];
    const initialTab = validViews.includes(viewParam as TabId) ? (viewParam as TabId) : 'chat';

    const [activeTab, setActiveTab] = useState<TabId>(initialTab);

    // Sync state with URL param
    useEffect(() => {
        const currentView = searchParams.get('view') as TabId;
        if (validViews.includes(currentView) && currentView !== activeTab) {
            setActiveTab(currentView);
        } else if (!currentView && activeTab !== 'chat') {
            // If no param, default is chat. Only update state if mismatch.
            setActiveTab('chat');
        }
    }, [searchParams, activeTab, validViews]);

    // Handle Tab Change with Shallow Routing
    const handleTabChange = (tab: TabId) => {
        setActiveTab(tab);
        // Update URL without full reload
        const newUrl = `/dashboard/${projectId}?view=${tab}`;
        router.push(newUrl, { scroll: false });
    };

    // Animation variants
    const slideVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 300 : -300,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 300 : -300,
            opacity: 0
        })
    };

    return (
        <div className="flex flex-col h-full w-full bg-luxury-bg relative overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden">
                <AnimatePresence initial={false} mode="wait">
                    <motion.div
                        key={activeTab}
                        className="absolute inset-0 h-full w-full"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
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

            {/* Bottom Navigation Bar */}
            <div className="h-16 bg-luxury-bg/80 backdrop-blur-lg border-t border-luxury-gold/10 flex items-center justify-around px-2 z-20 pb-safe">
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

function NavButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
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
    )
}
