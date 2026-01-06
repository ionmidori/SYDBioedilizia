import { db } from '../firebase-admin.js';
/**
 * Saves a new quote draft to the 'quotes' collection in Firestore.
 *
 * @param userId - The ID of the user (or session ID if anonymous)
 * @param imageUrl - Optional URL of the reference image or generated render
 * @param aiData - The structured data collected by the Technical Surveyor (Mode B)
 * @returns The ID of the created document
 */
export async function saveQuoteDraft(userId, imageUrl, aiData) {
    try {
        const firestore = db();
        // Sanitize and structure the data
        const quoteData = {
            ...aiData,
            clientId: userId, // Mapping userId to clientId or storing it separately
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
    }
    catch (error) {
        console.error('[QuoteSystem] Error saving quote draft:', error);
        throw new Error(`Failed to save quote draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
