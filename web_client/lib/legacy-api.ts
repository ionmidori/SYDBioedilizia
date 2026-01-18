import { db, storage } from './firebase-admin';

/**
 * Upload base64 encoded image to Firebase Storage
 */
export async function uploadBase64Image(options: {
    base64Data: string;
    sessionId: string;
    prefix?: string;
}): Promise<string> {
    const { base64Data, sessionId, prefix = 'user-uploads' } = options;

    try {
        if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{20,50}$/.test(sessionId)) {
            throw new Error('Invalid sessionId format');
        }

        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 format');
        }

        const mimeType = matches[1];
        const base64String = matches[2];
        const imageBuffer = Buffer.from(base64String, 'base64');
        const extension = mimeType.split('/')[1];
        const timestamp = Date.now();
        const uniqueId = crypto.randomUUID().split('-')[0];
        const fileName = `${prefix}/${sessionId}/${timestamp}-${uniqueId}.${extension}`;

        const bucket = storage().bucket();
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            contentType: mimeType,
            metadata: {
                cacheControl: 'public, max-age=31536000',
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    sessionId: sessionId,
                    source: 'chatbot-upload',
                },
            },
        });

        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log(`[Upload] ✅ Uploaded to ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        console.error('[Upload] Error:', error);
        throw error;
    }
}

/**
 * Get conversation context from Firestore
 */
export async function getConversationContext(
    sessionId: string,
    limit: number = 10
): Promise<Array<{ role: string; content: string }>> {
    try {
        const firestore = db();

        // Use 'sessions' collection (matching backend-python schema)
        const messagesRef = firestore
            .collection('sessions')
            .doc(sessionId)
            .collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(limit);

        const snapshot = await messagesRef.get();

        if (snapshot.empty) return [];

        const messages = snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    role: data.role as string,
                    content: data.content as string
                };
            })
            .reverse();

        return messages;

    } catch (error) {
        console.error('[History] Error loading context:', error);
        return [];
    }
}
