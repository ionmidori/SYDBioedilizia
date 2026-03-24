import React from 'react';
import { motion, useDragControls } from 'framer-motion';
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
    
    // Explicit drag controls to restrict the draggable area
    const dragControls = useDragControls();

    React.useEffect(() => {
        const updateConstraints = () => {
            const isMobile = window.innerWidth < 768;
            
            // L'immagine originale di Syd ha molto spazio trasparente attorno.
            // Il contenitore è 158px/208px, ma il nucleo visibile (Syd e la nuvola) 
            // è decisamente più piccolo e spostato verso destra.
            // Pertanto, permettiamo al drag di sforare le dimensioni fisiche classiche
            // permettendo valori più estremi a sinistra e in basso per allinearlo visivamente al bordo.
            
            const elementSize = isMobile ? 158 : 208;
            const margin = isMobile ? 16 : 24;
            
            // L'offset visivo (trasparenza) che possiamo spingere "fuori" dallo schermo.
            // Permettiamo di spostarlo più a sinistra (es. 48px in più su mobile)
            const visualOffsetLeft = isMobile ? 48 : 32;
            
            // Permettiamo di spostarlo molto più in basso prima di bloccarlo
            // poichè la base dell'immagine trasparente tocca in basso
            const visualOffsetBottom = isMobile ? 24 : 32;

            // Calcoliamo la distanza massima in negativo (da destra verso sinistra, dal basso verso l'alto)
            const maxLeftDrag = -(window.innerWidth - elementSize - margin) - visualOffsetLeft;
            const maxTopDrag = -(window.innerHeight - elementSize - margin);
            
            // Permettiamo di scendere leggermente più in basso rispetto al punto di partenza (bottom 0)
            const maxBottomDrag = visualOffsetBottom;

            setConstraints({
                top: maxTopDrag,
                left: maxLeftDrag,
                right: 0,
                bottom: maxBottomDrag
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
    
    const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        dragControls.start(e);
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
            dragControls={dragControls}
            dragListener={false} // Disable dragging from the entire container
            dragMomentum={false}
            dragElastic={0.1}
            dragConstraints={constraints}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}

            // Visual feedback during drag
            whileDrag={{
                scale: 1.1,
            }}
        >
            {/* 
              Inner wrapper handles the dynamic translation.
              When closed (!isOpen), it translates right by 48px (12 units) to compensate 
              for the avatar's transparent padding, bringing it right to the edge.
              When open (isOpen), it resets so the 'X' button stays safely inside the screen.
            */}
            <div className={cn(
                "flex items-center justify-end gap-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] relative",
                isOpen ? "translate-x-0" : "translate-x-12 md:translate-x-8"
            )}>
                <div className="pointer-events-auto -mr-16 md:-mr-24 -translate-y-20 md:-translate-y-24 z-10">
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
                        <>
                            {/* Visual Image */}
                            <div className="relative w-full h-full flex items-center justify-center overflow-visible pointer-events-none">
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
                            
                            {/* 
                                Invisible Drag Handle 
                                Positioned in the center of the image (over Syd's actual body)
                                to prevent accidental drags from the transparent edges.
                            */}
                            <div 
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-24 md:w-20 md:h-32 cursor-grab active:cursor-grabbing z-20 touch-none"
                                onPointerDown={startDrag}
                                aria-hidden="true"
                            />
                        </>
                    )}
                </Button>
            </div>
        </motion.div>
    );
}
