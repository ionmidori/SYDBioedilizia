module.exports = [
"[project]/ai_core/src/storage/upload.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "uploadGeneratedImage",
    ()=>uploadGeneratedImage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
async function uploadGeneratedImage(imageBuffer, userId, slug) {
    // 1. Get Storage Instance (Singleton from firebase-admin.ts)
    const storageInstance = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["storage"])();
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
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365
        });
        console.log(`[Storage] ✅ Upload success. URL: ${url.substring(0, 50)}...`);
        return url;
    } catch (error) {
        console.error(`[Storage] ❌ Failed to upload image to ${filePath}:`, error);
        throw new Error(`Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=ai_core_src_storage_upload_ts_7e4c6b11._.js.map