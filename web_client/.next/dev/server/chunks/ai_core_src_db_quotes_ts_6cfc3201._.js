module.exports = [
"[project]/ai_core/src/db/quotes.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "saveQuoteDraft",
    ()=>saveQuoteDraft
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/ai_core/src/firebase-admin.ts [app-route] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
async function saveQuoteDraft(userId, imageUrl, aiData) {
    try {
        const firestore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$ai_core$2f$src$2f$firebase$2d$admin$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"])();
        // Sanitize and structure the data
        const quoteData = {
            ...aiData,
            clientId: userId,
            renderUrl: imageUrl || aiData.renderUrl || null,
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            schemaVersion: 1
        };
        // Add to 'quotes' collection
        const docRef = await firestore.collection('quotes').add(quoteData);
        console.log(`[QuoteSystem] Draft saved with ID: ${docRef.id} for User: ${userId}`);
        return docRef.id;
    } catch (error) {
        console.error('[QuoteSystem] Error saving quote draft:', error);
        throw new Error(`Failed to save quote draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
];

//# sourceMappingURL=ai_core_src_db_quotes_ts_6cfc3201._.js.map