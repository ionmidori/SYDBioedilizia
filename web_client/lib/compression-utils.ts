/**
 * File Compression Utilities.
 *
 * This module provides compression and processing utilities for uploads:
 * - Image compression (aggressive for large files)
 * - MIME type detection
 * - File routing logic
 *
 * @see hooks/useUpload.ts (consumer of these utilities)
 */

/**
 * Configuration for image compression.
 */
export interface CompressionConfig {
    /** Maximum width in pixels */
    maxWidth: number;
    /** Quality (0-1) */
    quality: number;
    /** Output MIME type */
    mimeType: string;
}

/**
 * Gets the appropriate upload endpoint based on file MIME type.
 *
 * @param mimeType - The file's MIME type
 * @returns The API endpoint path
 */
export function getUploadEndpoint(mimeType: string): string {
    if (mimeType.startsWith('image/')) {
        return '/api/py/upload/image';
    }
    if (mimeType.startsWith('video/')) {
        return '/api/py/upload/video';
    }
    if (mimeType === 'application/pdf') {
        return '/api/py/upload/document';
    }
    throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Determines if a file requires compression based on its type.
 */
export function shouldCompress(mimeType: string): boolean {
    return mimeType.startsWith('image/');
}

/**
 * Calculates optimal compression settings based on file size.
 */
function getCompressionConfig(
    fileSize: number,
    targetMaxSizeMB: number = 10
): CompressionConfig {
    const maxSizeBytes = targetMaxSizeMB * 1024 * 1024;
    const ratio = fileSize / maxSizeBytes;

    if (ratio <= 1) {
        return { maxWidth: 2048, quality: 0.85, mimeType: 'image/jpeg' };
    }

    if (ratio > 8) {
        console.log(`[Compression] Extreme: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
        return { maxWidth: 1024, quality: 0.5, mimeType: 'image/jpeg' };
    }
    if (ratio > 4) {
        console.log(`[Compression] Heavy: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
        return { maxWidth: 1280, quality: 0.6, mimeType: 'image/jpeg' };
    }
    if (ratio > 2) {
        console.log(`[Compression] Medium: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
        return { maxWidth: 1536, quality: 0.7, mimeType: 'image/jpeg' };
    }
    console.log(`[Compression] Light: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    return { maxWidth: 1800, quality: 0.75, mimeType: 'image/jpeg' };
}

/**
 * Compresses an image file using canvas.
 *
 * @param file - The image File to compress
 * @param config - Optional compression configuration
 * @returns Promise<Blob> - The compressed image blob
 */
export async function compressImage(
    file: File,
    config?: Partial<CompressionConfig>
): Promise<Blob> {
    const {
        maxWidth = 2048,
        quality = 0.8,
        mimeType = 'image/jpeg',
    } = { ...getCompressionConfig(file.size), ...config };

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const targetSize = 10 * 1024 * 1024;
                        if (blob.size > targetSize && quality > 0.5) {
                            console.warn('[Compression] Still too large, retrying with 50% quality...');
                            canvas.toBlob(
                                (retryBlob) => {
                                    if (retryBlob) resolve(retryBlob);
                                    else reject(new Error('Compression retry failed'));
                                },
                                mimeType,
                                0.5
                            );
                        } else {
                            resolve(blob);
                        }
                    } else {
                        reject(new Error('Image compression failed'));
                    }
                },
                mimeType,
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for compression'));
        };

        img.src = url;
    });
}

/**
 * Validates file type against allowed types.
 */
export function isAllowedType(file: File, allowedTypes: string[]): boolean {
    for (const pattern of allowedTypes) {
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2);
            if (file.type.startsWith(prefix)) return true;
        } else if (file.type === pattern) {
            return true;
        }
    }
    return false;
}


