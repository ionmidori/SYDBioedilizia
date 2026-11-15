'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openChat } from '@/lib/chat-events';
import { HOUSE_TABS, houseTabFromView, houseTabHref, type HouseTab } from '@/lib/house-tabs';
import { cn } from '@/lib/utils';
import { HouseMediaView } from './HouseMediaView';
import { HouseQuotePanel } from './HouseQuotePanel';
import { HouseSettingsView } from './HouseSettingsView';
import { WithHouseChat } from './WithHouseChat';

const PANELS: Record<HouseTab, (props: { chatId: string }) => ReactNode> = {
    media: HouseMediaView,
    quote: HouseQuotePanel,
    house: HouseSettingsView,
};

/**
 * The dashboard is the house (Phase 139): a full-width Operate workspace with
 * three URL-synced tabs (Media, Preventivo, Casa) and direct access to the
 * persistent floating SYD assistant. All three tab panels stay mounted so
 * room filters, quote state, and unsaved form fields survive tab switching.
 */
export function HouseDashboard() {
    const router = useRouter();
    const view = useSearchParams().get('view');
    const activeTab = houseTabFromView(view);
    const rescuedChatViewRef = useRef(false);
    const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        if (view === 'chat' && !rescuedChatViewRef.current) {
            rescuedChatViewRef.current = true;
            openChat();
        } else if (view !== 'chat') {
            rescuedChatViewRef.current = false;
        }
    }, [view]);

    const selectTab = (tab: HouseTab) => {
        router.replace(houseTabHref(tab), { scroll: false });
    };

    const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const last = HOUSE_TABS.length - 1;
        const target =
            event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
            : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
            : event.key === 'Home' ? 0
            : event.key === 'End' ? last
            : null;
        if (target === null) return;
        event.preventDefault();
        selectTab(HOUSE_TABS[target].id);
        tabButtonsRef.current[target]?.focus();
    };

    return (
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-serif font-bold text-ink">La tua casa</h1>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => openChat()}
                    className="gap-2 min-h-11 rounded-xl border-line bg-surface text-ink hover:bg-surface-muted touch-manipulation"
                >
                    <MessageSquare aria-hidden="true" className="w-4 h-4 text-accent-ink" />
                    Chiedi a SYD
                </Button>
            </div>

            <WithHouseChat>
                {(chatId) => (
                    <>
                        {/* On mobile the house tabs sit in DashboardHeader's second row. */}
                        <div role="tablist" aria-label="Sezioni della casa" className="hidden md:flex items-center gap-2 border-b border-line pb-3">
                            {HOUSE_TABS.map((tab, index) => {
                                const selected = tab.id === activeTab;
                                return (
                                    <button
                                        key={tab.id}
                                        ref={(node) => {
                                            tabButtonsRef.current[index] = node;
                                        }}
                                        type="button"
                                        role="tab"
                                        id={`house-tab-${tab.id}`}
                                        aria-selected={selected}
                                        aria-controls={`house-panel-${tab.id}`}
                                        tabIndex={selected ? 0 : -1}
                                        onClick={() => selectTab(tab.id)}
                                        onKeyDown={(event) => handleTabKeyDown(event, index)}
                                        className={cn(
                                            'min-h-11 px-5 rounded-xl border text-xs font-bold uppercase tracking-widest transition-colors touch-manipulation cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-canvas',
                                            selected
                                                ? 'bg-accent text-on-accent border-accent'
                                                : 'glass border-line text-ink-muted hover:text-ink',
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="min-w-0">
                            {HOUSE_TABS.map((tab) => {
                                const Panel = PANELS[tab.id];
                                return (
                                    <div
                                        key={tab.id}
                                        role="tabpanel"
                                        id={`house-panel-${tab.id}`}
                                        aria-labelledby={`house-tab-${tab.id}`}
                                        hidden={tab.id !== activeTab}
                                    >
                                        <Panel chatId={chatId} />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </WithHouseChat>
        </div>
    );
}
