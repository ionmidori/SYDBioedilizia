// Local Message interface matching useChatHistory structure
interface Message {
    id: string;
    role: string;
    content: string;
    createdAt?: Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolInvocations?: any[];
    tool_call_id?: string;
    experimental_attachments?: unknown[];
}

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

        // Extract from experimental_attachments (images uploaded by user)
        if (msg.experimental_attachments && Array.isArray(msg.experimental_attachments)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            msg.experimental_attachments.forEach((attachment: any, attIndex: number) => {
                if (attachment.url) {
                    assets.push({
                        id: `${msg.id}-attachment-${attIndex}`,
                        type: 'image',
                        url: attachment.url,
                        title: attachment.name || `Immagine ${attIndex + 1}`,
                        timestamp,
                        messageId: msg.id
                    });
                }
            });
        }

        // Extract URLs from content (renders, quotes)
        if (typeof msg.content === 'string') {
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
