
import { db } from '../firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Interface corresponding to the data structure collected for the quote
 */
export interface QuoteDraftData {
    // Technical Data (The Convergence Protocol)
    logistics?: {
        floor?: string;
        elevator?: boolean;
        yearOfConstruction?: string;
        ceilingHeight?: string;
    };
    scopeOfWork?: {
        demolitions?: boolean;
        electrical?: string;
        plumbing?: string;
        fixtures?: string;
    };
    quantities?: {
        sqm?: number;
        points?: number;
    };
    // Context
    roomType?: string;
    style?: string;
    // Generated Visuals
    renderUrl?: string;

    // Metadata
    status: 'draft' | 'pending_review' | 'processed';
    createdAt: string;
    updatedAt: string;
    schemaVersion: number;
}

/**
 * Saves a new quote draft to the 'quotes' collection in Firestore.
 * 
 * @param userId - The ID of the user (or session ID if anonymous)
 * @param imageUrl - Optional URL of the reference image or generated render
 * @param aiData - The structured data collected by the Technical Surveyor (Mode B)
 * @returns The ID of the created document
 */
export async function saveQuoteDraft(
    userId: string,
    imageUrl: string | null | undefined,
    aiData: any
): Promise<string> {
    try {
        const firestore: Firestore = db();

        // Sanitize and structure the data
        const quoteData: QuoteDraftData = {
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

    } catch (error) {
        console.error('[QuoteSystem] Error saving quote draft:', error);
        throw new Error(`Failed to save quote draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
