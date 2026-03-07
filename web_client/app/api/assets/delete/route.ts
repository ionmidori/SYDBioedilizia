
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { assetId, projectId, type } = body;

        console.log('[API] Deleting asset:', { assetId, projectId, type });

        if (!assetId || !projectId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 🔒 AUTH VERIFICATION
        const { auth } = await import('@/lib/firebase-admin');
        const authHeader = req.headers.get('Authorization');

        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let decodedToken;
        try {
            decodedToken = await auth().verifyIdToken(authHeader.split('Bearer ')[1]);
        } catch {
            return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });
        }

        // 🔒 AUTHORIZATION VERIFICATION (BOLA/IDOR Prevention)
        const projectRef = db().collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        
        if (!projectSnap.exists) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }
        
        const projectData = projectSnap.data();
        if (projectData?.user_id !== decodedToken.uid) {
            console.warn(`[SECURITY] User ${decodedToken.uid} attempted to delete asset in project ${projectId} owned by ${projectData?.user_id}`);
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 1. Delete from Firestore (Project Files Subcollection)
        // Path: projects/{projectId}/files/{assetId}
        const fileRef = db().collection('projects').doc(projectId).collection('files').doc(assetId);

        // Verify existence before delete?
        const doc = await fileRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        await fileRef.delete();
        console.log('[API] Firestore document deleted');

        // 2. Delete from Storage (Optional - depending on if it's referenced elsewhere)
        // For now, let's try to delete if we can parse the path.
        // But the previous backfill logic didn't save the Storage Path, only the URL.
        // Deleting via URL is tricky without bucket parsing.

        // If we want to be safe, we just remove the reference from the Gallery for now.
        // User asked to "Cancel" (Delete) from Gallery. 

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[API] Error deleting asset:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
