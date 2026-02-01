/**
 * Hook for editing gallery image metadata.
 * Allows users to update room type and status for project files.
 */
import { useState } from 'react';
import { useAuth } from './useAuth';

interface UpdateMetadataRequest {
    projectId: string;
    filePath: string;
    room?: string;
    status?: string;
}

interface UpdateMetadataResponse {
    success: boolean;
    file_path: string;
    updated_metadata: Record<string, string>;
}

export function useMetadataEditor() {
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { refreshToken } = useAuth();

    const updateMetadata = async (request: UpdateMetadataRequest): Promise<boolean> => {
        setIsUpdating(true);
        setError(null);

        try {
            const token = await refreshToken();

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/update-file-metadata`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    project_id: request.projectId,
                    file_path: request.filePath,
                    room: request.room,
                    status: request.status,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Failed to update metadata' }));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            const data: UpdateMetadataResponse = await response.json();
            console.log('[useMetadataEditor] Metadata updated successfully:', data);
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[useMetadataEditor] Update failed:', errorMessage);
            setError(errorMessage);
            return false;
        } finally {
            setIsUpdating(false);
        }
    };

    return {
        updateMetadata,
        isUpdating,
        error,
    };
}
