import type { UploadItem } from '@/types/media';

/**
 * Media payload assembled from completed uploads, shaped for the chat
 * `sendMessage` body (mediaUrls for images, videoFileUris = gs:// Storage
 * URIs the model reads natively, mediaMetadata keyed by URL for
 * size/mime/filename display).
 *
 * Pure — no React, no upload hook — so image/video/mixed/empty cases are
 * unit-tested without mounting ChatWidget.
 */
// A `type` alias (not `interface`) gets an implicit index signature for object
// literal types, so this satisfies `sendMessage`'s `body: Record<string, unknown>`
// parameter without a cast — while keeping property-name typo checking, which an
// explicit `[key: string]: unknown` index signature would silently disable.
export type ChatMediaPayload = {
    mediaUrls: string[];
    mediaMetadata: Record<string, { mimeType: string; fileSize: number; originalFileName: string }>;
    videoFileUris?: string[];
    /** Room of the project the turn (and its uploads) is about (Phase 138). */
    roomId?: string;
};

/**
 * `roomId` is the active room; when the uploads were filed in a room, the turn
 * goes to that room instead (the chip may have moved since the upload).
 */
export function buildMediaPayload(completedUploads: UploadItem[], roomId?: string | null): ChatMediaPayload {
    const mediaUrls = completedUploads
        .filter(u => u.serverData?.asset_type === 'image')
        .map(u => u.serverData!.url);

    const videoFileUris = completedUploads
        .filter(u => u.serverData?.asset_type === 'video')
        .map(u => (u.serverData as { file_uri: string }).file_uri);

    const mediaMetadata: ChatMediaPayload['mediaMetadata'] = {};
    completedUploads.forEach(u => {
        if (u.serverData) {
            mediaMetadata[u.serverData.url] = {
                mimeType: u.serverData.mime_type,
                fileSize: u.serverData.size_bytes,
                originalFileName: u.serverData.filename,
            };
        }
    });

    return {
        mediaUrls,
        mediaMetadata,
        videoFileUris: videoFileUris.length > 0 ? videoFileUris : undefined,
        roomId: completedUploads.find((u) => u.serverData && u.roomId)?.roomId ?? roomId ?? undefined,
    };
}
