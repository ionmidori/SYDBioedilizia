'use client';

import { useRef, type KeyboardEvent } from 'react';

import { COMPANY_TABS, type CompanyTab } from '@/lib/admin/company-info-logic';
import { cn } from '@/lib/utils';

export const tabId = (tab: CompanyTab) => `company-tab-${tab}`;
export const panelId = (tab: CompanyTab) => `company-panel-${tab}`;

interface Props {
    active: CompanyTab;
    onSelect: (tab: CompanyTab) => void;
    /** Tabs holding a problem the admin has to fix. */
    errorTabs: ReadonlySet<CompanyTab>;
}

/** Accessible tab list: arrows, Home and End move and select; scrolls sideways on a phone. */
export function CompanyTabs({ active, onSelect, errorTabs }: Props) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);

    const onKeyDown = (event: KeyboardEvent, index: number) => {
        const last = COMPANY_TABS.length - 1;
        const target =
            event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
            : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
            : event.key === 'Home' ? 0
            : event.key === 'End' ? last
            : null;
        if (target === null) return;
        event.preventDefault();
        onSelect(COMPANY_TABS[target].id);
        buttons.current[target]?.focus();
    };

    return (
        <div role="tablist" aria-label="Sezioni della scheda società" className="flex gap-1.5 overflow-x-auto pb-1">
            {COMPANY_TABS.map((tab, index) => {
                const selected = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        ref={(node) => {
                            buttons.current[index] = node;
                        }}
                        id={tabId(tab.id)}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={panelId(tab.id)}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onSelect(tab.id)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={cn(
                            'relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm cursor-pointer focus:outline-hidden focus-visible:ring-2 ring-ring',
                            selected ? 'bg-primary text-on-primary font-medium shadow-xs' : 'border border-line bg-surface text-ink hover:bg-primary-subtle hover:text-primary-ink hover:border-primary/40',
                        )}
                    >
                        {tab.label}
                        {errorTabs.has(tab.id) && (
                            <>
                                <span aria-hidden className="size-2 rounded-full bg-danger" />
                                <span className="sr-only">: contiene errori</span>
                            </>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
