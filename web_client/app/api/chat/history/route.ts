import { NextRequest, NextResponse } from 'next/server';
import { getConversationContext } from '@/lib/legacy-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/history?sessionId=xxx
 * Load conversation history for a session
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json(
                { error: 'sessionId is required' },
                { status: 400 }
            );
        }

        console.log('[GET /api/chat/history] Loading history for session:', sessionId);

        // Load last 50 messages from Firestore
        const messages = await getConversationContext(sessionId, 50);

        console.log('[GET /api/chat/history] Loaded', messages.length, 'messages');

        return NextResponse.json({
            messages,
            sessionId,
        });

    } catch (error) {
        console.error('[GET /api/chat/history] Error:', error);
        return NextResponse.json(
            { error: 'Failed to load history' },
            { status: 500 }
        );
    }
}
