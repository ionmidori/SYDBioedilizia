import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Scissors, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { triggerHaptic } from '@/lib/haptics';

interface VideoTrimmerProps {
    /** The video file to be trimmed */
    file: File | null;
    /** Open state of the dialog */
    isOpen: boolean;
    /** Triggered when the user confirms the trim selection */
    onConfirm: (file: File, startTime: number, endTime: number) => void;
    /** Triggered when the dialog is closed or cancelled */
    onCancel: () => void;
}

export function VideoTrimmer({ file, isOpen, onConfirm, onCancel }: VideoTrimmerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Consolidate state to avoid cascading renders in useEffect
    const [videoState, setVideoState] = useState<{
        url: string | null;
        duration: number;
        isPlaying: boolean;
        range: [number, number];
    }>({
        url: null,
        duration: 0,
        isPlaying: false,
        range: [0, 100]
    });

    useEffect(() => {
        let url: string | null = null;
        if (file && isOpen) {
            url = URL.createObjectURL(file);
            const currentUrl = url;
            const timer = setTimeout(() => {
                setVideoState(prev => ({
                    ...prev,
                    url: currentUrl,
                    duration: 0,
                    isPlaying: false,
                    range: [0, 100]
                }));
            }, 0);
            return () => {
                clearTimeout(timer);
                URL.revokeObjectURL(currentUrl);
            };
        } else {
            const timer = setTimeout(() => {
                setVideoState({
                    url: null,
                    duration: 0,
                    isPlaying: false,
                    range: [0, 100]
                });
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [file, isOpen]);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const duration = videoRef.current.duration;
            setVideoState(prev => ({
                ...prev,
                duration,
                range: [0, duration]
            }));
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const current = videoRef.current.currentTime;
            
            // Loop back if playing beyond trim end
            if (videoState.isPlaying && current >= videoState.range[1]) {
                videoRef.current.pause();
                setVideoState(prev => ({ ...prev, isPlaying: false }));
                videoRef.current.currentTime = videoState.range[0];
            }
        }
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoState.isPlaying) {
                videoRef.current.pause();
            } else {
                // If at the end of the trim, restart
                if (videoRef.current.currentTime >= videoState.range[1]) {
                    videoRef.current.currentTime = videoState.range[0];
                }
                videoRef.current.play();
            }
            setVideoState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
            triggerHaptic();
        }
    };

    const handleRangeChange = (value: number[]) => {
        if (value.length === 2 && videoRef.current) {
            const [start, end] = value;
            setVideoState(prev => ({ ...prev, range: [start, end] }));
            
            // Only seek if paused to let user preview the trim
            if (!videoState.isPlaying) {
                 videoRef.current.currentTime = start;
            }
        }
    };

    const handleConfirm = () => {
        if (file) {
            onConfirm(file, videoState.range[0], videoState.range[1]);
        }
    };

    // Format time: MM:SS.ms
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <DialogOverlay className="bg-black/80 backdrop-blur-sm" />
            <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-luxury-bg border-luxury-gold/20 shadow-2xl">
                <DialogTitle className="sr-only">Ritaglio Video</DialogTitle>
                <DialogDescription className="sr-only">Seleziona la parte di video da inviare.</DialogDescription>

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-luxury-gold/10 bg-luxury-bg/50">
                    <h2 className="text-lg font-semibold text-luxury-gold flex items-center gap-2">
                        <Scissors className="w-5 h-5" /> Ritaglia Video
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onCancel} className="text-luxury-text/60 hover:text-white rounded-full">
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Video Container */}
                <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
                    {videoState.url && (
                        <video
                            ref={videoRef}
                            src={videoState.url}
                            className="w-full h-full object-contain"
                            onLoadedMetadata={handleLoadedMetadata}
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setVideoState(prev => ({ ...prev, isPlaying: false }))}
                            playsInline
                            preload="metadata"
                        />
                    )}

                    {/* Play/Pause Overlay Button */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <AnimatePresence>
                            {!videoState.isPlaying && videoState.duration > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="w-16 h-16 rounded-full bg-luxury-teal/80 flex items-center justify-center shadow-[0_0_30px_rgba(20,184,166,0.5)] backdrop-blur-md pointer-events-auto cursor-pointer"
                                    onClick={togglePlay}
                                >
                                    <Play className="w-8 h-8 text-white ml-1" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Controls Area (Glassmorphism) */}
                <div className="p-5 flex flex-col gap-6 bg-gradient-to-t from-luxury-bg to-luxury-bg/80">
                    
                    {/* Time display */}
                    <div className="flex justify-between text-xs text-luxury-text/60 font-mono">
                        <span>{formatTime(videoState.range[0])}</span>
                        <span>{formatTime(videoState.range[1])}</span>
                    </div>

                    {/* Range Slider */}
                    {videoState.duration > 0 && (
                        <div className="relative flex items-center h-6">
                           <Slider
                                defaultValue={[0, videoState.duration]}
                                value={videoState.range}
                                min={0}
                                max={videoState.duration}
                                step={0.1}
                                onValueChange={handleRangeChange}
                                className="z-10"
                            />
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-between items-center mt-2">
                         <div className="text-sm text-luxury-text/60">
                            Durata: {formatTime(videoState.range[1] - videoState.range[0])}
                         </div>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={onCancel} className="text-luxury-text hover:bg-white/5 rounded-xl">
                                Annulla
                            </Button>
                            <Button onClick={handleConfirm} className="bg-luxury-teal hover:bg-luxury-teal/90 text-white rounded-xl shadow-lg shadow-luxury-teal/20">
                                Conferma
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
