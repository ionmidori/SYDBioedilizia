import React from 'react';
import { Button } from '@/components/ui/button';
import { Minimize2 } from 'lucide-react';
import ArchitectAvatar from '@/components/ArchitectAvatar';

interface ChatHeaderProps {
    onMinimize: () => void;
}

/**
 * Chat header component with avatar, status, and minimize button
 * Extracted from ChatWidget.tsx (lines 516-526)
 */
export function ChatHeader({ onMinimize }: ChatHeaderProps) {
    return (
        <div
            className="flex items-center justify-between p-4 border-b border-white/5 bg-slate-900/50 flex-shrink-0"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
            <div className="flex items-center gap-3">
                <ArchitectAvatar />
                <div>
                    <h3 className="font-bold text-white flex items-center gap-2">
                        SYD
                        <span
                            className="text-[9px] font-medium px-2 py-0.5 rounded-md backdrop-blur-md border border-white/20 text-blue-200"
                            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%)' }}
                        >
                            Architetto personale
                        </span>
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            Online
                        </span>
                    </p>
                </div>
            </div>
            <Button
                variant="ghost"
                size="icon"
                onClick={onMinimize}
                className="text-slate-400 hover:text-white"
            >
                <Minimize2 className="w-5 h-5" />
            </Button>
        </div>
    );
}
