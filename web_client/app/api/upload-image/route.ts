import { NextRequest, NextResponse } from 'next/server';
import { uploadBase64Image } from '@ai-core';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/upload-image
 * 
 * SECURE: Upload user-provided image to Firebase Storage
 * 
 * SECURITY MEASURES:
 * - Session validation (sanitized)
 * - Rate limiting (5 uploads/minute per session)
 * - Size validation (10MB max)
 * - MIME type validation
 * - Path traversal protection
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { image, sessionId } = body;

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔒 SECURITY VALIDATION
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 1. Required fields
        if (!image || !sessionId) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // 2. SessionId Validation & Sanitization (prevent path traversal)
        if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{20,50}$/.test(sessionId)) {
            console.error('[Upload Image API] ❌ Invalid sessionId format:', sessionId);
            return NextResponse.json(
                { success: false, error: 'Invalid session format' },
                { status: 400 }
            );
        }

        // 3. Rate Limiting (20 uploads/minute per session - uses existing rate limiter)
        const rateLimitKey = `upload-${sessionId}`;
        const rateLimitResult = await checkRateLimit(rateLimitKey);

        if (!rateLimitResult.allowed) {
            const retryMs = rateLimitResult.resetAt.getTime() - Date.now();
            const retrySec = Math.ceil(retryMs / 1000);

            console.warn(`[Upload Image API] ⚠️ Rate limit exceeded for session: ${sessionId.substring(0, 8)}...`);
            return NextResponse.json(
                {
                    success: false,
                    error: `Too many uploads. Please wait ${retrySec} seconds.`,
                },
                {
                    status: 429,
                    headers: { 'Retry-After': retrySec.toString() }
                }
            );
        }

        // 4. Base64 Format Validation
        if (!image.startsWith('data:image/')) {
            return NextResponse.json(
                { success: false, error: 'Invalid image format.' },
                { status: 400 }
            );
        }

        // 5. MIME Type Whitelist (prevent upload of non-images)
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        const mimeMatch = image.match(/^data:(image\/[a-z]+);base64,/);

        if (!mimeMatch || !allowedMimeTypes.includes(mimeMatch[1])) {
            console.error('[Upload Image API] ❌ Invalid MIME type:', mimeMatch?.[1]);
            return NextResponse.json(
                { success: false, error: 'Unsupported image format. Use JPEG, PNG, or WebP.' },
                { status: 400 }
            );
        }

        // 6. Size Validation (prevent huge payloads)
        const maxSizeBytes = 15 * 1024 * 1024; // 15MB base64 (≈11MB actual)
        if (image.length > maxSizeBytes) {
            const sizeMB = (image.length / 1024 / 1024).toFixed(2);
            console.error(`[Upload Image API] ❌ Image too large: ${sizeMB}MB`);
            return NextResponse.json(
                { success: false, error: 'Image too large. Maximum 10MB.' },
                { status: 413 }
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 📤 UPLOAD TO STORAGE
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        console.log('[Upload Image API] ✅ Validation passed, uploading...');
        console.log('[Upload Image API] Session:', sessionId.substring(0, 8) + '...');

        const publicUrl = await uploadBase64Image({
            base64Data: image,
            sessionId: sessionId, // Already sanitized
            prefix: 'user-uploads',
        });

        console.log('[Upload Image API] ✅ Upload successful');

        // ✅ SECURITY: Don't return full base64 in response (save bandwidth)
        return NextResponse.json({
            success: true,
            url: publicUrl,
            // preview: image, // ❌ Removed - too large, client already has it
        });

    } catch (error) {
        console.error('[Upload Image API] Error:', error);

        // ✅ SECURITY: Don't leak internal error details to client
        const errorMessage = error instanceof Error && error.message.includes('too large')
            ? error.message
            : 'Upload failed. Please try again.';

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}
