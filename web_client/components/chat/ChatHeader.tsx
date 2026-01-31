import React from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2 } from 'lucide-react';
import ArchitectAvatar from '@/components/ArchitectAvatar';

interface ChatHeaderProps {
    onMinimize?: () => void;
}

/**
 * Chat header component with avatar, status, and minimize button
 * Extracted from ChatWidget.tsx (lines 516-526)
 */
export function ChatHeader({ onMinimize }: ChatHeaderProps) {
    return (
        <div
            className="flex items-center justify-between p-4 border-b border-luxury-gold/10 bg-luxury-bg/50 flex-shrink-0"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
            <div className="flex items-center gap-3">
                <ArchitectAvatar />
                <div>
                    <h3 className="font-serif font-bold text-luxury-text flex items-center gap-2">
                        SYD
                        <span
                            className="text-[9px] font-sans font-medium px-2 py-0.5 rounded-md backdrop-blur-md border border-luxury-gold/30 text-luxury-gold"
                            style={{ background: 'linear-gradient(135deg, rgba(233,196,106,0.15) 0%, rgba(233,196,106,0.05) 100%)' }}
                        >
                            Architetto personale
                        </span>
                    </h3>
                    <p className="text-xs text-luxury-text/60 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-luxury-teal rounded-full animate-pulse" />
                            Online
                        </span>
                    </p>
                </div>
            </div>
            {onMinimize && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMinimize}
                    className="text-luxury-text/60 hover:text-luxury-gold hover:bg-luxury-gold/5"
                >
                    <Minimize2 className="w-5 h-5" />
                </Button>
            )}
        </div>
    );
}
