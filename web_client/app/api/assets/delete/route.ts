/**
 * DEPRECATED — Asset deletion has been moved to the Python backend.
 * Clients should call DELETE /api/py/projects/{projectId}/files/{fileId} directly.
 * This stub returns 410 Gone so any stale client receives a clear error.
 */
import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json(
        { error: 'Endpoint removed. Use DELETE /api/py/projects/{projectId}/files/{fileId}' },
        { status: 410 }
    );
}
