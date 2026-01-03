import { db } from '../firebase-admin';
import { COLLECTIONS } from './schema';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Get conversation context (last N messages) for a session
 * Optimized for low latency (~30-50ms)
 */
export async function getConversationContext(
    sessionId: string,
    limit: number = 10
): Promise<Array<{ role: string; content: string; toolInvocations?: any[] }>> {
    try {
        const firestore = db();

        // Query last N messages, ordered by timestamp descending
        const messagesRef = firestore
            .collection(COLLECTIONS.SESSIONS)
            .doc(sessionId)
            .collection(COLLECTIONS.MESSAGES)
            .orderBy('timestamp', 'desc')
            .limit(limit);

        const snapshot = await messagesRef.get();

        if (snapshot.empty) {
            console.log(`[getConversationContext] No messages found for session: ${sessionId}`);
            return [];
        }

        // Convert to array and reverse (oldest first for chat context)
        const messages = snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    role: data.role as 'user' | 'assistant' | 'system',
                    content: data.content as string,
                    toolInvocations: data.toolCalls?.map((tc: any) => ({
                        toolCallId: crypto.randomUUID(), // Generate transient ID
                        toolName: tc.name,
                        args: tc.args,
                        state: 'result',
                        result: tc.result
                    }))
                };
            })
            .reverse(); // Reverse to get chronological order

        console.log(`[getConversationContext] Loaded ${messages.length} messages for session: ${sessionId}`);
        return messages;

    } catch (error) {
        console.error('[getConversationContext] Error loading context:', error);
        return [];
    }
}

/**
 * Save a message to Firestore
 * Non-blocking operation for performance
 */
export async function saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: {
        imageUrl?: string;
        toolCalls?: Array<{ name: string; args: any; result: any }>;
        tokens?: { input: number; output: number };
    }
): Promise<void> {
    try {
        const firestore = db();

        const messageData = {
            role,
            content,
            timestamp: FieldValue.serverTimestamp(),
            ...metadata,
        };

        // Add message to subcollection
        await firestore
            .collection(COLLECTIONS.SESSIONS)
            .doc(sessionId)
            .collection(COLLECTIONS.MESSAGES)
            .add(messageData);

        // Update session metadata
        await firestore
            .collection(COLLECTIONS.SESSIONS)
            .doc(sessionId)
            .set(
                {
                    updatedAt: FieldValue.serverTimestamp(),
                    messageCount: FieldValue.increment(1),
                    lastMessagePreview: content.substring(0, 100),
                },
                { merge: true }
            );

        console.log(`[saveMessage] Saved ${role} message to session: ${sessionId}`);

    } catch (error) {
        console.error('[saveMessage] Error saving message:', error);
        // Don't throw - message save failures shouldn't break the chat
    }
}

/**
 * Create or update a session
 */
export async function ensureSession(sessionId: string): Promise<void> {
    try {
        const firestore = db();
        const sessionRef = firestore.collection(COLLECTIONS.SESSIONS).doc(sessionId);

        const session = await sessionRef.get();

        if (!session.exists) {
            await sessionRef.set({
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                messageCount: 0,
                status: 'active',
            });

            console.log(`[ensureSession] Created new session: ${sessionId}`);
        }
    } catch (error) {
        console.error('[ensureSession] Error ensuring session:', error);
    }
}
