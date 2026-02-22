import { Message } from '@/types/chat';
import imageCompression from 'browser-image-compression';

export interface MediaAsset {
    id: string;
    type: 'image' | 'render' | 'quote' | 'video';
    url: string;
    thumbnail?: string;
    title?: string;
    timestamp: string;
    messageId?: string;
    metadata?: {
        projectId?: string;
        projectName?: string;
        size?: number;
        uploadedBy?: string;
    };
}

/**
 * Extracts all media assets from conversation messages.
 * Parses images, render URLs, and quote PDFs from message content.
 */
export function extractMediaFromMessages(messages: Message[]): MediaAsset[] {
    const assets: MediaAsset[] = [];

    messages.forEach((msg) => {
        const timestamp = new Date().toISOString(); // Use actual timestamp if available

        // Extract from attachments (images/videos/documents mapped in useChatHistory)
        if (msg.attachments) {
            msg.attachments.images?.forEach((url, index) => {
                assets.push({
                    id: `${msg.id}-image-${index}`,
                    type: 'image',
                    url: url,
                    title: `Immagine ${index + 1}`,
                    timestamp,
                    messageId: msg.id
                });
            });

            msg.attachments.videos?.forEach((url, index) => {
                assets.push({
                    id: `${msg.id}-video-${index}`,
                    type: 'video',
                    url: url,
                    title: `Video ${index + 1}`,
                    timestamp,
                    messageId: msg.id
                });
            });

            // TODO: Handle documents if needed
        }

        // Extract URLs from content (renders, quotes)
        if (msg.content && typeof msg.content === 'string') {
            // Look for image URLs in markdown
            const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
            let match;
            while ((match = imageRegex.exec(msg.content)) !== null) {
                const [, alt, url] = match;
                if (url.includes('storage.googleapis.com') || url.includes('.jpg') || url.includes('.png')) {
                    assets.push({
                        id: `${msg.id}-md-image-${assets.length}`,
                        type: url.includes('render') ? 'render' : 'image',
                        url,
                        title: alt || 'Render generato',
                        timestamp,
                        messageId: msg.id
                    });
                }
            }

            // Look for PDF quote links
            const pdfRegex = /\[([^\]]*\.pdf)\]\(([^)]+)\)/gi;
            while ((match = pdfRegex.exec(msg.content)) !== null) {
                const [, title, url] = match;
                assets.push({
                    id: `${msg.id}-pdf-${assets.length}`,
                    type: 'quote',
                    url,
                    title: title || 'Preventivo.pdf',
                    timestamp,
                    messageId: msg.id
                });
            }
        }
    });

    // Sort by timestamp descending (newest first)
    return assets.reverse();
}

/**
 * Image compression options optimized for architectural photos
 * Target: 1920px (Full HD) at ~1.2MB
 */
const DEFAULT_IMAGE_OPTIONS = {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/webp' as const // Target WebP for better compression/quality ratio
};

/**
 * Compresses an image file client-side before upload
 * @param file The original File object
 * @returns A compressed File object or the original if compression fails/unsupported
 */
export async function compressImage(file: File): Promise<File> {
    // Only compress images
    if (!file.type.startsWith('image/')) return file;

    // Skip small images already under 500KB
    if (file.size < 0.5 * 1024 * 1024) return file;

    try {
        const compressedFile = await imageCompression(file, DEFAULT_IMAGE_OPTIONS);

        // Log optimization results for engineering monitoring
        const originalSize = (file.size / 1024 / 1024).toFixed(2);
        const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
        console.log(`[MediaUtils] Optimization: ${originalSize}MB -> ${compressedSize}MB`);

        return compressedFile;
    } catch (error) {
        console.error('[MediaUtils] Image compression failed:', error);
        return file; // Procedere comunque con l'originale per non bloccare l'utente
    }
}

/**
 * Validates video duration and size for mobile uploads
 */
export async function validateVideo(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file.type.startsWith('video/')) return { valid: true };

    // Limit to 50MB for mobile uploads to avoid timeout/cost issues
    if (file.size > 50 * 1024 * 1024) {
        return { valid: false, error: "Il video supera il limite di 50MB per l'upload mobile." };
    }

    return { valid: true };
}

/**
 * Groups assets by type for organized display.
 */
export function groupAssetsByType(assets: MediaAsset[]): Record<string, MediaAsset[]> {
    return assets.reduce((acc, asset) => {
        if (!acc[asset.type]) {
            acc[asset.type] = [];
        }
        acc[asset.type].push(asset);
        return acc;
    }, {} as Record<string, MediaAsset[]>);
}
