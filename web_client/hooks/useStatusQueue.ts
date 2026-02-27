
import { useState, useEffect, useRef, useCallback } from 'react';

const MIN_DISPLAY_MS = 800;

export function useStatusQueue() {
    const [currentStatus, setCurrentStatus] = useState<string | null>(null);
    const queueRef = useRef<string[]>([]);
    const processingRef = useRef<boolean>(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const processQueueRef = useRef<() => void>(() => {});

    const processQueue = useCallback(() => {
        if (processingRef.current) return;

        if (queueRef.current.length === 0) {
            setCurrentStatus(null);
            return;
        }

        // Lock processing
        processingRef.current = true;

        // Take next item
        const nextMessage = queueRef.current.shift();
        if (nextMessage) {
            setCurrentStatus(nextMessage);
        }

        // Wait minimum time before processing next
        timeoutRef.current = setTimeout(() => {
            processingRef.current = false;
            processQueueRef.current();
        }, MIN_DISPLAY_MS);
    }, []);

    // Update ref whenever processQueue changes
    useEffect(() => {
        processQueueRef.current = processQueue;
    }, [processQueue]);

    const addStatus = useCallback((message: string) => {
        // Prevent duplicate consecutive messages  
        const lastInQueue = queueRef.current[queueRef.current.length - 1];
        if (lastInQueue === message && !process.env.NEXT_PUBLIC_IS_PROD) {
            console.log('[useStatusQueue] Skipping duplicate:', message);
            return;
        }
        if (currentStatus === message && queueRef.current.length === 0) {
            return;
        }

        queueRef.current.push(message);
        processQueue();
    }, [currentStatus, processQueue]);

    const clearQueue = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        queueRef.current = [];
        processingRef.current = false;
        setCurrentStatus(null);
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return {
        currentStatus,
        addStatus,
        clearQueue
    };
}

