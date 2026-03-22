import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WelcomeBadge } from './WelcomeBadge';
import { triggerHaptic } from '@/lib/haptics';

interface ChatToggleButtonProps {
    isOpen: boolean;
    onClick: () => void;
}

/**
 * Floating toggle button component with drag functionality
 * 
 * Uses CSS for base positioning pinned to safe areas.
 * Uses an inner wrapper to translate the avatar closer to the edge
 * without breaking the position of the "X" close button when open.
 */
export function ChatToggleButton({ isOpen, onClick }: ChatToggleButtonProps) {
    // Track if we are dragging to prevent click
    const isDraggingRef = React.useRef(false);
    const [constraints, setConstraints] = React.useState({ top: 0, left: 0, right: 0, bottom: 0 });

    React.useEffect(() => {
        const updateConstraints = () => {
            const isMobile = window.innerWidth < 768;
            // Dimesioni del contenitore principale
            const elementSize = isMobile ? 158 : 208;
            // Margini dati da bottom-4 right-4 (16px) o bottom-6 right-6 (24px)
            const margin = isMobile ? 16 : 24;
            
            // Calcoliamo la distanza massima in negativo per non uscire dallo schermo
            // a sinistra (left) e in alto (top)
            const maxLeftDrag = -(window.innerWidth - elementSize - margin);
            const maxTopDrag = -(window.innerHeight - elementSize - margin);

            setConstraints({
                top: maxTopDrag,
                left: maxLeftDrag,
                right: 0,
                bottom: 0
            });
        };

        updateConstraints();
        window.addEventListener('resize', updateConstraints);
        return () => window.removeEventListener('resize', updateConstraints);
    }, []);

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
            triggerHaptic();
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

            // Base position via CSS - pinned to safe area to avoid notch/home indicator overlap
            className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50"
            style={{ 
                backfaceVisibility: 'hidden', 
                transform: 'translateZ(0)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                paddingRight: 'env(safe-area-inset-right)'
            }}

            // Drag configuration
            drag
            dragMomentum={false}
            dragElastic={0.1}
            dragConstraints={constraints}
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
            {/* 
              Inner wrapper handles the dynamic translation.
              When closed (!isOpen), it translates right by 48px (12 units) to compensate 
              for the avatar's transparent padding, bringing it right to the edge.
              When open (isOpen), it resets so the 'X' button stays safely inside the screen.
            */}
            <div className={cn(
                "flex items-center justify-end gap-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                isOpen ? "translate-x-0" : "translate-x-12 md:translate-x-8"
            )}>
                <div className="pointer-events-auto -mr-12 md:-mr-22 -translate-y-20 md:-translate-y-24 z-10">
                    <WelcomeBadge isOpen={isOpen} onOpenChat={onClick} />
                </div>
                <Button
                    onClick={handleClick}
                    size="icon"
                    aria-label={isOpen ? "Chiudi chat" : "Apri chat"}
                    className={cn(
                        "rounded-full transition-all duration-300 relative flex items-center justify-center !overflow-visible",
                        isOpen
                            ? "bg-luxury-bg text-luxury-text shadow-2xl border border-luxury-gold/20 w-14 h-14 md:w-16 md:h-16"
                            : "bg-transparent shadow-none border-none hover:scale-105 w-[158px] h-[158px] md:w-52 md:h-48"
                    )}
                >
                    {isOpen ? (
                        <X className="w-8 h-8 text-luxury-gold" />
                    ) : (
                        <div className="relative w-full h-full flex items-center justify-center overflow-visible">
                            <Image
                                src="/assets/syd_final_v9.png"
                                alt="Chat"
                                fill
                                sizes="(max-width: 768px) 158px, 208px"
                                className="object-contain"
                                draggable={false}
                                style={{ imageRendering: 'auto', willChange: 'auto' }}
                            />
                        </div>
                    )}
                </Button>
            </div>
        </motion.div>
    );
}
