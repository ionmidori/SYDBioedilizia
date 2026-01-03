import { db } from '../firebase-admin';
import { COLLECTIONS, Lead } from './schema';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Save lead data to Firestore
 * Called from the submit_lead_data tool
 */
export async function saveLead(data: {
    sessionId: string;
    userId?: string;
    name: string;
    email: string;
    phone?: string;
    projectDetails: string;
    roomType?: string;
    style?: string;
    estimatedBudget?: string;
}): Promise<{ success: boolean; leadId?: string; error?: string }> {
    try {
        const firestore = db();

        const leadData: Omit<Lead, 'createdAt'> & { createdAt: any } = {
            ...data,
            createdAt: FieldValue.serverTimestamp(),
            status: 'new',
        };

        const leadRef = await firestore
            .collection(COLLECTIONS.LEADS)
            .add(leadData);

        console.log(`[saveLead] Lead saved with ID: ${leadRef.id}`);

        return {
            success: true,
            leadId: leadRef.id,
        };

    } catch (error) {
        console.error('[saveLead] Error saving lead:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get all leads (for admin dashboard - optional)
 */
export async function getLeads(
    status?: 'new' | 'contacted' | 'converted',
    limit: number = 50
): Promise<Lead[]> {
    try {
        const firestore = db();

        let query = firestore
            .collection(COLLECTIONS.LEADS)
            .orderBy('createdAt', 'desc')
            .limit(limit);

        if (status) {
            query = query.where('status', '==', status) as any;
        }

        const snapshot = await query.get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
        })) as unknown as Lead[];

    } catch (error) {
        console.error('[getLeads] Error fetching leads:', error);
        return [];
    }
}
