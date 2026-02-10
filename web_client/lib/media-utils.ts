import { Message } from '@/types/chat';

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
