import React from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2 } from 'lucide-react';
import ArchitectAvatar from '@/components/ArchitectAvatar';
import { ProjectSelector } from './ProjectSelector';

interface ChatHeaderProps {
    onMinimize?: () => void;
    projectId?: string;
    showSelector?: boolean;
    onProjectSelect?: (projectId: string) => void;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Chat header component with avatar, status, and minimize button
 * Extracted from ChatWidget.tsx (lines 516-526)
 */
export function ChatHeader({ onMinimize, projectId, showSelector, onProjectSelect, onPointerDown }: ChatHeaderProps) {
    return (
        <div
            onPointerDown={onPointerDown}
            className={`flex flex-col p-0 bg-luxury-bg/90 backdrop-blur-md border-b border-luxury-gold/10 shadow-sm flex-shrink-0 relative z-[60] ${onPointerDown ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
            {/* M3 Drag Handle Indicator */}
            {onPointerDown && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-luxury-gold/20 rounded-full pointer-events-none" />
            )}
            
            {/* Standard spacing for desktop/mobile without handle */}
            <div className="pt-2" />

            <div className="flex items-center justify-between px-4 pb-4">

                {/* Left: Branding (Always visible) */}
                <div className="flex items-center gap-3">
                    <ArchitectAvatar />
                    <div>
                        <div className="flex flex-col">
                            <h3 className="font-serif font-bold text-luxury-text text-lg leading-none">
                                SYD
                            </h3>
                            <span className="text-[10px] font-sans font-medium text-luxury-gold/80 mt-0.5">
                                Architetto personale
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right: Project Selector & Actions */}
                <div className="flex items-center gap-4">
                    {(projectId || showSelector) && (
                        <ProjectSelector
                            currentProjectId={projectId || ''}
                            onProjectSelect={onProjectSelect}
                        />
                    )}

                    {onMinimize && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onMinimize}
                            className="text-luxury-text/60 hover:text-luxury-gold hover:bg-luxury-gold/5"
                            // Prevent drag when clicking the button
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Minimize2 className="w-5 h-5" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
