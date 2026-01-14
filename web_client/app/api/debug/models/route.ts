import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        timestamp: new Date().toISOString(),
        models: {
            chat: process.env.CHAT_MODEL_VERSION || 'gemini-2.5-flash (default)',
            vision: process.env.VISION_MODEL_VERSION || 'gemini-2.5-flash-image (default)',
            imagen: process.env.IMAGEN_MODEL_VERSION || 'imagen-3.0-generate-001 (default)',
        },
        project: process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Not set',
    });
}
