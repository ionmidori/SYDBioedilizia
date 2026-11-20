"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2, MoreVertical, RotateCcw } from 'lucide-react';
import ArchitectAvatar from '@/components/ArchitectAvatar';

export interface ChatHeaderProps {
    onMinimize?: () => void;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    clearActionLabel?: string;
    canClear?: boolean;
    onRequestClear?: () => void;
}

const HEADER_DRAG_HANDLE = (
    <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-line-strong/60 rounded-full pointer-events-none" />
);
const MORE_VERTICAL_ICON = <MoreVertical className="w-4 h-4" aria-hidden="true" />;
const ROTATE_CCW_ICON = <RotateCcw className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />;
const MINIMIZE_ICON = <Minimize2 className="w-4 h-4" aria-hidden="true" />;

/**
 * Chat header component with avatar, status, contextual actions menu, and minimize button.
 * Extracted from ChatWidget.tsx (lines 516-526)
 */
function ChatHeaderComponent({
    onMinimize,
    onPointerDown,
    clearActionLabel,
    canClear = true,
    onRequestClear,
}: ChatHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuId = useId();
    const menuContainerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRef = useRef<HTMLButtonElement>(null);

    const showClearMenu = Boolean(onRequestClear && clearActionLabel);

    useEffect(() => {
        if (!menuOpen) return;
        if (canClear) {
            itemRef.current?.focus();
        }
        const handlePointerDownOutside = (event: PointerEvent) => {
            if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDownOutside);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDownOutside);
        };
    }, [menuOpen, canClear]);

    const stopPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        e.stopPropagation();
    }, []);

    const toggleMenu = useCallback(() => {
        setMenuOpen((prev) => !prev);
    }, []);

    const handleSelectClear = useCallback(() => {
        if (!canClear || !onRequestClear) return;
        triggerRef.current?.focus();
        setMenuOpen(false);
        onRequestClear();
    }, [canClear, onRequestClear]);

    const handleMenuKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (!menuOpen) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                triggerRef.current?.focus();
            } else if (e.key === 'Tab') {
                triggerRef.current?.focus();
                setMenuOpen(false);
            } else if (
                e.key === 'ArrowDown' ||
                e.key === 'ArrowUp' ||
                e.key === 'Home' ||
                e.key === 'End'
            ) {
                e.preventDefault();
                if (canClear) {
                    itemRef.current?.focus();
                }
            }
        },
        [menuOpen, canClear],
    );

    return (
        <div
            onPointerDown={onPointerDown}
            className={`flex flex-col p-0 bg-surface border-b border-line shadow-sm flex-shrink-0 relative z-[60] ${onPointerDown ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
            {/* M3 Drag Handle Indicator (mobile only) */}
            {onPointerDown ? HEADER_DRAG_HANDLE : null}

            {/* Standard spacing for desktop/mobile without handle */}
            <div className="pt-2" />

            <div className="flex items-center justify-between px-4 pb-3.5">
                {/* Left: Branding (Always visible) */}
                <div className="flex items-center gap-3">
                    <ArchitectAvatar />
                    <div>
                        <div className="flex flex-col">
                            <h3 className="font-serif font-bold text-ink text-lg leading-none">
                                SYD
                            </h3>
                            <span className="text-xs font-sans font-medium text-primary-ink mt-1">
                                Architetto personale
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {showClearMenu ? (
                        <div
                            ref={menuContainerRef}
                            className="relative"
                            onKeyDown={handleMenuKeyDown}
                        >
                            <Button
                                ref={triggerRef}
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Altre azioni chat"
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                aria-controls={menuId}
                                onPointerDown={stopPointerDown}
                                onClick={toggleMenu}
                                className="text-ink-muted hover:text-primary-ink hover:bg-primary-subtle border border-line bg-surface-muted/50 rounded-full transition-colors cursor-pointer"
                            >
                                {MORE_VERTICAL_ICON}
                            </Button>
                            {menuOpen ? (
                                <div
                                    id={menuId}
                                    role="menu"
                                    aria-orientation="vertical"
                                    aria-label="Azioni chat"
                                    className="absolute right-0 top-full mt-2 z-[70] min-w-[230px] rounded-2xl bg-surface border border-line shadow-2 py-1"
                                >
                                    <button
                                        ref={itemRef}
                                        type="button"
                                        role="menuitem"
                                        disabled={!canClear}
                                        onClick={handleSelectClear}
                                        className="flex w-full items-center gap-2.5 min-h-[44px] px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {ROTATE_CCW_ICON}
                                        <span>{clearActionLabel}</span>
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {onMinimize ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onMinimize}
                            aria-label="Riduci la chat"
                            className="text-ink-muted hover:text-primary-ink hover:bg-primary-subtle border border-line bg-surface-muted/50 rounded-full transition-colors cursor-pointer"
                            // Prevent drag when clicking the button
                            onPointerDown={stopPointerDown}
                        >
                            {MINIMIZE_ICON}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export const ChatHeader = React.memo(ChatHeaderComponent);
