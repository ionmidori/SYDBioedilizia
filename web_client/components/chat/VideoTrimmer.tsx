import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Pause, Scissors, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
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
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Trim range: [start, end]
    const [range, setRange] = useState<[number, number]>([0, 100]);

    useEffect(() => {
        if (file && isOpen) {
            const url = URL.createObjectURL(file);
            setVideoUrl(url);
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            setVideoUrl(null);
            setDuration(0);
            setCurrentTime(0);
            setIsPlaying(false);
            setRange([0, 100]);
        }
    }, [file, isOpen]);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setRange([0, videoRef.current.duration]);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const current = videoRef.current.currentTime;
            setCurrentTime(current);
            
            // Loop back if playing beyond trim end
            if (isPlaying && current >= range[1]) {
                videoRef.current.pause();
                setIsPlaying(false);
                videoRef.current.currentTime = range[0];
                setCurrentTime(range[0]);
            }
        }
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                // If at the end of the trim, restart
                if (videoRef.current.currentTime >= range[1]) {
                    videoRef.current.currentTime = range[0];
                }
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
            triggerHaptic();
        }
    };

    const handleRangeChange = (value: number[]) => {
        if (value.length === 2 && videoRef.current) {
            const [start, end] = value;
            setRange([start, end]);
            
            // Only seek if paused to let user preview the trim
            if (!isPlaying) {
                 videoRef.current.currentTime = start;
                 setCurrentTime(start);
            }
        }
    };

    const handleConfirm = () => {
        if (file) {
            onConfirm(file, range[0], range[1]);
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
                    {videoUrl && (
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            className="w-full h-full object-contain"
                            onLoadedMetadata={handleLoadedMetadata}
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                            playsInline
                            preload="metadata"
                        />
                    )}

                    {/* Play/Pause Overlay Button */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <AnimatePresence>
                            {!isPlaying && duration > 0 && (
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
                        <span>{formatTime(range[0])}</span>
                        <span>{formatTime(range[1])}</span>
                    </div>

                    {/* Range Slider */}
                    {duration > 0 && (
                        <div className="relative flex items-center h-6">
                           <Slider
                                defaultValue={[0, duration]}
                                value={range}
                                min={0}
                                max={duration}
                                step={0.1}
                                onValueChange={handleRangeChange}
                                className="z-10"
                            />
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-between items-center mt-2">
                         <div className="text-sm text-luxury-text/60">
                            Durata: {formatTime(range[1] - range[0])}
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
