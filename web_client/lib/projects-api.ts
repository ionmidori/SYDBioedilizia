import { describeApiError, fetchWithAuth, fetchValidated } from '@/lib/api-client';
import type { ProjectFileMetadata } from '@/types/projects';
import { projectSchema } from '@/lib/validation/project-schema';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import type { ProjectDetailsFormData } from '@/lib/validation/project-details-schema';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py'; // Use proxy or direct URL

export const projectsApi = {
    /**
     * Get details of a single project.
     * Returns null if the project is not found (404).
     */
    getProject: async (sessionId: string): Promise<z.infer<typeof projectSchema> | null> => {
        try {
            return await fetchValidated(
                `${API_ROOT}/projects/${sessionId}`,
                projectSchema
            );
        } catch (error: unknown) {
            // Check if it's a network 404 vs validation error
            const typedError = error as { status?: number; message?: string };
            if (typedError?.status === 404) {
                logger.debug('[ProjectsApi] Project not found (404), returning null');
                return null;
            }
            throw new Error(typedError?.message ? describeApiError(typedError) : 'Errore nel recupero del progetto');
        }
    },

    /**
     * Update the construction site details (PATCH /projects/{id}/details).
     * Called from the browser so the request carries the App Check token: the
     * former Server Action reached the backend without one and got 403.
     */
    updateProjectDetails: async (sessionId: string, details: ProjectDetailsFormData): Promise<void> => {
        const response = await fetchWithAuth(
            `${API_ROOT}/projects/${encodeURIComponent(sessionId)}/details`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(details),
            }
        );
        if (!response.ok) {
            const body: unknown = await response.json().catch(() => undefined);
            throw new Error(describeApiError(body));
        }
    },

    /**
     * Add file metadata to a project.
     */
    addProjectFile: async (sessionId: string, fileMetadata: ProjectFileMetadata): Promise<void> => {
        const response = await fetchWithAuth(`${API_ROOT}/projects/${sessionId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fileMetadata),
        });

        if (!response.ok) {
            throw new Error('Impossibile salvare i metadati del file');
        }
    }
};
