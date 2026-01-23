import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WelcomeBadge } from './WelcomeBadge';

interface ChatToggleButtonProps {
    isOpen: boolean;
    onClick: () => void;
}

/**
 * Floating toggle button component with drag functionality
 * 
 * Uses CSS for base positioning (bottom-right corner)
 * Uses Framer Motion for drag offset only
 */
export function ChatToggleButton({ isOpen, onClick }: ChatToggleButtonProps) {
    // Track if we are dragging to prevent click
    const isDraggingRef = React.useRef(false);

    const handleDragStart = () => {
        isDraggingRef.current = true;
    };

    const handleDragEnd = () => {
        // Small delay to allow click event to fire/check status
        setTimeout(() => {
            isDraggingRef.current = false;
        }, 150);
    };

    const handleClick = (e: React.MouseEvent) => {
        if (!isDraggingRef.current) {
            onClick();
        } else {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    return (
        <motion.div
            // Initial animation
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}

            // Base position via CSS - bottom-right corner
            // Added flex container for badge + button
            // Base position via CSS - bottom-right corner
            // Added flex container for badge + button
            className="fixed bottom-1 right-1 z-50 flex items-center justify-end gap-0"

            // Drag configuration
            drag
            dragMomentum={false}
            dragElastic={0.1}
            dragConstraints={{
                top: -window.innerHeight + 150,
                left: -window.innerWidth + 150,
                right: 0,
                bottom: 0
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}

            // Visual feedback during drag
            whileDrag={{
                scale: 1.1,
                cursor: 'grabbing',
            }}
            whileHover={{
                cursor: 'grab'
            }}
        >
            <div className="pointer-events-auto -mr-8 z-10">
                <WelcomeBadge isOpen={isOpen} onOpenChat={onClick} />
            </div>
            <Button
                onClick={handleClick}
                size="icon"
                aria-label={isOpen ? "Chiudi chat" : "Apri chat"}
                className={cn(
                    "w-52 h-48 rounded-full transition-all duration-300 relative flex items-center justify-center !overflow-visible",
                    isOpen
                        ? "bg-luxury-bg text-luxury-text shadow-2xl border border-luxury-gold/20 w-16 h-16"
                        : "bg-transparent shadow-none border-none hover:scale-105"
                )}
            >
                {isOpen ? (
                    <X className="w-8 h-8 text-luxury-gold" />
                ) : (
                    <div className="relative w-full h-full flex items-center justify-center !overflow-visible">
                        <img
                            src="/assets/syd_final_v9.png"
                            alt="Chat"
                            className="w-full h-full max-w-none object-contain drop-shadow-xl transform transition-transform duration-300"
                            draggable={false}
                        />
                    </div>
                )}
            </Button>
        </motion.div>
    );
}
