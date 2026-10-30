'use client';

import { Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatWidget from '@/components/chat/ChatWidget';
import { houseTabFromView, houseTabHref, PANEL_TABS, panelTabFromView, type PanelTab } from '@/lib/house-tabs';
import { cn } from '@/lib/utils';
import { HouseMediaView } from './HouseMediaView';
import { HouseQuotePanel } from './HouseQuotePanel';
import { HouseSettingsView } from './HouseSettingsView';
import { WithHouseChat } from './WithHouseChat';

const PANELS: Record<PanelTab, (props: { chatId: string }) => ReactNode> = {
    media: HouseMediaView,
    quote: HouseQuotePanel,
    house: HouseSettingsView,
};

/**
 * The dashboard is the house (Phase 139): the user's one chat beside a panel
 * of its media, quote and details. One tree for every screen, so the chat is
 * mounted once: on desktop the chat and the panel sit side by side; on a phone
 * `?view=` shows one of them (the tabs are in DashboardHeader). The panel's
 * tabs all stay mounted, so a filter or a half-filled form survives a switch.
 */
export function HouseDashboard() {
    return <WithHouseChat>{(chatId) => <House chatId={chatId} />}</WithHouseChat>;
}

function House({ chatId }: { chatId: string }) {
    const router = useRouter();
    const view = useSearchParams().get('view');
    const onChat = houseTabFromView(view) === 'chat';
    const panelTab = panelTabFromView(view);

    return (
        <div className="w-full grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] overflow-hidden bg-luxury-bg h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)]">
            <main
                data-testid="chat-column"
                className={cn('relative flex-col min-h-0 bg-black/20 overflow-hidden md:flex', onChat ? 'flex' : 'hidden')}
            >
                <Suspense fallback={<div className="flex-1 bg-luxury-bg animate-pulse" />}>
                    <ChatWidget variant="inline" />
                </Suspense>
            </main>

            <aside
                data-testid="panel-column"
                aria-label="La tua casa"
                className={cn(
                    'relative flex-col min-h-0 md:border-l border-luxury-gold/10 bg-luxury-bg/50 backdrop-blur-xl md:flex',
                    onChat ? 'hidden' : 'flex',
                )}
            >
                {/* On a phone the tabs are in DashboardHeader. */}
                <div role="tablist" aria-label="La tua casa" className="hidden md:flex gap-1 p-2 border-b border-luxury-gold/10">
                    {PANEL_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            id={`house-tab-${tab.id}`}
                            aria-selected={tab.id === panelTab}
                            aria-controls={`house-panel-${tab.id}`}
                            onClick={() => router.replace(houseTabHref(tab.id), { scroll: false })}
                            className={cn(
                                'flex-1 min-h-11 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors touch-manipulation',
                                tab.id === panelTab
                                    ? 'bg-luxury-gold/15 text-luxury-gold'
                                    : 'text-luxury-text/50 hover:text-luxury-text hover:bg-white/5',
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {PANEL_TABS.map((tab) => {
                    const Panel = PANELS[tab.id];
                    return (
                        <div
                            key={tab.id}
                            role="tabpanel"
                            id={`house-panel-${tab.id}`}
                            aria-labelledby={`house-tab-${tab.id}`}
                            hidden={tab.id !== panelTab}
                            className="flex-1 min-h-0 overflow-y-auto p-4"
                        >
                            <Panel chatId={chatId} />
                        </div>
                    );
                })}
            </aside>
        </div>
    );
}
