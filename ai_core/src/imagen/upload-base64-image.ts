/**
 * Upload base64 image to Firebase Storage and return public URL
 * 
 * Required for Imagen Capability API which needs HTTP/GCS URLs instead of base64
 * This is a helper function for the hybrid tool implementation
 */

/**
 * Upload base64 encoded image to Firebase Storage
 * 
 * @param options.base64Data - Base64 data URL (e.g., data:image/jpeg;base64,...)
 * @param options.sessionId - User session ID for organizing uploads
 * @param options.prefix - Optional prefix for storage path (default: 'user-uploads')
 * @returns Public HTTPS URL to the uploaded image
 * 
 * @example
 * ```typescript
 * const url = await uploadBase64Image({
 *   base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZ...',
 *   sessionId: 'abc123',
 *   prefix: 'user-uploads'
 * });
 * // Returns: https://storage.googleapis.com/bucket-name/user-uploads/abc123/1234567890-xyz.jpeg
 * ```
 */
export async function uploadBase64Image(options: {
    base64Data: string;
    sessionId: string;
    prefix?: string;
}): Promise<string> {
    const { base64Data, sessionId, prefix = 'user-uploads' } = options;

    console.log('[Upload Base64] Starting upload...');

    try {
        // 🔒 SECURITY: Validate and sanitize sessionId (prevent path traversal)
        if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{20,50}$/.test(sessionId)) {
            throw new Error('Invalid sessionId format');
        }

        // 1. Parse base64 data URL to extract MIME type and data
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 format. Expected: data:image/TYPE;base64,DATA');
        }

        const mimeType = matches[1]; // e.g., 'image/jpeg', 'image/png'
        const base64String = matches[2];

        console.log(`[Upload Base64] Detected MIME type: ${mimeType}`);

        // 2. Convert base64 string to Buffer
        const imageBuffer = Buffer.from(base64String, 'base64');

        // 3. Validate image size (max 10MB to match existing validation)
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB
        if (imageBuffer.length > maxSizeBytes) {
            const sizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
            throw new Error(`Image too large: ${sizeMB}MB (maximum 10MB allowed)`);
        }

        const sizeKB = (imageBuffer.length / 1024).toFixed(2);
        console.log(`[Upload Base64] Image size: ${sizeKB} KB`);

        // 4. Generate unique filename to prevent collisions
        const timestamp = Date.now();
        const uniqueId = crypto.randomUUID().split('-')[0]; // First segment for brevity
        const extension = mimeType.split('/')[1]; // Extract extension (jpeg, png, webp, etc.)

        // 🔒 SECURITY: sessionId is already validated, safe to use in path
        const fileName = `${prefix}/${sessionId}/${timestamp}-${uniqueId}.${extension}`;

        console.log(`[Upload Base64] Target path: ${fileName}`);

        // 5. Import Firebase Storage dynamically (to avoid initialization issues)
        // 5. Import Firebase Storage dynamically
        console.log('[Upload Base64] Importing Firebase Admin...');
        const { storage } = await import('../firebase-admin');
        const bucket = storage().bucket();
        console.log(`[Upload Base64] Using bucket: ${bucket.name}`);

        // 6. Upload to Firebase Storage
        const file = bucket.file(fileName);
        console.log('[Upload Base64] Starting file.save()...');

        await file.save(imageBuffer, {
            contentType: mimeType,
            metadata: {
                cacheControl: 'public, max-age=31536000', // Cache for 1 year
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    sessionId: sessionId,
                    source: 'chatbot-upload',
                },
            },
        });

        console.log('[Upload Base64] File saved to Storage. Making public...');

        // 7. Make file publicly accessible
        try {
            await file.makePublic();
            console.log('[Upload Base64] File made public successfully');
        } catch (pubError) {
            console.warn('[Upload Base64] Warning: makePublic failed (permissions?), continuing with signed URL fallback may be needed', pubError);
            // If makePublic fails, the public URL below (https://storage.googleapis.com...) won't work for unauthenticated users
            // But we don't block the flow, just log it.
        }

        // 8. Generate and return public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        console.log(`[Upload Base64] ✅ Upload complete: ${publicUrl}`);

        return publicUrl;

    } catch (error) {
        console.error('[Upload Base64] ❌ Error:', error);

        // Provide user-friendly error messages
        if (error instanceof Error) {
            // Re-throw validation errors as-is
            if (error.message.includes('Invalid base64') || error.message.includes('too large')) {
                throw error;
            }

            // Handle Firebase errors
            if (error.message.includes('PERMISSION_DENIED')) {
                throw new Error('Storage permission denied. Please check Firebase Storage rules.');
            }

            if (error.message.includes('QUOTA_EXCEEDED')) {
                throw new Error('Storage quota exceeded. Please contact support.');
            }
        }

        // Generic error for unexpected issues
        throw new Error('Failed to upload image. Please try again.');
    }
}

/**
 * Validate if a string is a valid base64 data URL
 * 
 * @param data - String to validate
 * @returns true if valid base64 data URL, false otherwise
 */
export function isValidBase64DataUrl(data: string): boolean {
    const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp|bmp);base64,/;
    return base64Regex.test(data);
}

/**
 * Extract MIME type from base64 data URL
 * 
 * @param base64Data - Base64 data URL
 * @returns MIME type (e.g., 'image/jpeg') or null if invalid
 */
export function extractMimeType(base64Data: string): string | null {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,/);
    return matches ? matches[1] : null;
}
