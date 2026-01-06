import { storage } from '../firebase-admin';

/**
 * Uploads a generated image buffer to Firebase Storage.
 * 
 * Target Path: generated/${userId}/${timestamp}_${slug}.jpg
 * Security: Private bucket, returns Signed URL (1 year validity)
 *
 * @param imageBuffer - The raw image buffer (JPEG).
 * @param userId - The ID of the user (or session ID) to scope the file.
 * @param slug - A descriptive slug for the filename (e.g. "modern_living_room").
 * @returns A signed URL valid for 1 year.
 */
export async function uploadGeneratedImage(imageBuffer: Buffer, userId: string, slug: string): Promise<string> {
    // 1. Get Storage Instance (Singleton from firebase-admin.ts)
    const storageInstance = storage();
    const bucket = storageInstance.bucket();

    // 2. Define Path
    const timestamp = Date.now();
    // Sanitize slug to be safe for filenames
    const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filePath = `generated/${userId}/${timestamp}_${safeSlug}.jpg`;

    const file = bucket.file(filePath);

    try {
        console.log(`[Storage] Uploading ${imageBuffer.length} bytes to ${filePath}...`);

        // 3. Upload File
        await file.save(imageBuffer, {
            contentType: 'image/jpeg',
            metadata: {
                contentType: 'image/jpeg',
                // Custom metadata if needed in future
                generatedBy: 'JIT-Pipeline'
            }
        });

        // 4. Generate Signed URL (Read-Only)
        // Valid for 365 days. 
        // Note: For production, consider shorter expiry or authenticating the client logic.
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1 year
        });

        console.log(`[Storage] ✅ Upload success. URL: ${url.substring(0, 50)}...`);
        return url;

    } catch (error) {
        console.error(`[Storage] ❌ Failed to upload image to ${filePath}:`, error);
        throw new Error(`Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
