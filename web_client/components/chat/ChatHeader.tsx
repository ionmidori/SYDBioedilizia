import React from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2 } from 'lucide-react';
import ArchitectAvatar from '@/components/ArchitectAvatar';

interface ChatHeaderProps {
    onMinimize?: () => void;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Chat header component with avatar, status, and minimize button
 * Extracted from ChatWidget.tsx (lines 516-526)
 */
export function ChatHeader({ onMinimize, onPointerDown }: ChatHeaderProps) {
    return (
        <div
            onPointerDown={onPointerDown}
            className={`flex flex-col p-0 bg-surface border-b border-line shadow-sm flex-shrink-0 relative z-[60] ${onPointerDown ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
            {/* M3 Drag Handle Indicator (mobile only) */}
            {onPointerDown && (
                <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-line-strong/60 rounded-full pointer-events-none" />
            )}
            
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
                <div className="flex items-center gap-4">
                    {onMinimize && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onMinimize}
                            aria-label="Riduci la chat"
                            className="text-ink-muted hover:text-primary-ink hover:bg-primary-subtle border border-line bg-surface-muted/50 rounded-full transition-colors cursor-pointer"
                            // Prevent drag when clicking the button
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Minimize2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
