import { useCallback } from 'react';

export interface ShareData {
    title?: string;
    text?: string;
    url?: string;
    files?: File[];
}

/**
 * Custom hook for Native Web Share API.
 * Provides OS-native share sheet for quotes, renders, and files.
 * 
 * Falls back to clipboard copy if Web Share is unsupported.
 */
export function useWebShare() {
    const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

    /**
     * Trigger native share sheet.
     * Returns true if share was successful, false if cancelled or unsupported.
     */
    const share = useCallback(async (data: ShareData): Promise<boolean> => {
        if (!canShare) {
            // Fallback: Copy to clipboard
            if (data.url || data.text) {
                try {
                    await navigator.clipboard.writeText(data.url || data.text || '');
                    return true;
                } catch (err) {
                    console.error('[WebShare] Clipboard fallback failed:', err);
                    return false;
                }
            }
            return false;
        }

        try {
            await navigator.share(data);
            console.log('[WebShare] Share successful');
            return true;
        } catch (err: any) {
            //  User cancelled share (not an error)
            if (err.name === 'AbortError') {
                console.log('[WebShare] User cancelled');
                return false;
            }
            console.error('[WebShare] Share failed:', err);
            return false;
        }
    }, [canShare]);

    /**
     * Share a quote PDF or summary text.
     */
    const shareQuote = useCallback(async (quoteUrl: string, projectName: string) => {
        return share({
            title: `Preventivo ${projectName} - SYD`,
            text: `Ecco il preventivo per il progetto "${projectName}". Creato con SYD, il tuo Architetto AI.`,
            url: quoteUrl
        });
    }, [share]);

    /**
     * Share a render image.
     */
    const shareRender = useCallback(async (imageUrl: string, roomType: string) => {
        return share({
            title: `Rendering ${roomType} - SYD`,
            text: `Guarda questo rendering 3D generato con SYD!`,
            url: imageUrl
        });
    }, [share]);

    return {
        canShare,
        share,
        shareQuote,
        shareRender
    };
}
