import { db } from '../firebase-admin';
import { COLLECTIONS } from './schema';

/**
 * Server Component to load chat history from Firestore
 * This runs on the server, improving SEO and initial page load performance
 */
export async function getChatHistory(sessionId: string) {
    try {
        console.log('[Server] Loading chat history for session:', sessionId);

        const firestore = db();

        const snapshot = await firestore
            .collection(COLLECTIONS.SESSIONS)
            .doc(sessionId)
            .collection(COLLECTIONS.MESSAGES)
            .orderBy('timestamp', 'asc')
            .get();

        if (snapshot.empty) {
            console.log('[Server] No messages found in Firestore');
            return [];
        }

        const messages = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                role: data.role,
                content: data.content,
                timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
            };
        });

        console.log(`[Server] Loaded ${messages.length} messages from Firestore`);
        return messages;

    } catch (error) {
        console.error('[Server] Error loading chat history:', error);
        return [];
    }
}
