import { fetchWithAuth, fetchValidated } from '@/lib/api-client';
import { ProjectListItem, ProjectCreate, ProjectUpdate } from '@/types/projects';
import { projectListResponseSchema, projectSchema } from '@/lib/validation/project-list-schema';
import { z } from 'zod';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py'; // Use proxy or direct URL

export const projectsApi = {
    /**
     * Lists all projects for the authenticated user.
     */
    listProjects: async (): Promise<ProjectListItem[]> => {
        return fetchValidated(
            `${API_ROOT}/projects`,
            projectListResponseSchema
        );
    },

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
                console.log('[ProjectsApi] Project not found (404), returning null');
                return null;
            }
            throw new Error(typedError?.message || 'Errore nel recupero del progetto');
        }
    },

    /**
     * Create a new project.
     */
    createProject: async (data: ProjectCreate = {}): Promise<{ session_id: string }> => {
        const response = await fetchWithAuth(`${API_ROOT}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            let detail = 'Impossibile creare il progetto';
            try {
                const errorBody = await response.json();
                if (errorBody.detail) detail = errorBody.detail;
            } catch {
                // response body was not JSON — keep generic message
            }
            throw new Error(detail);
        }

        return response.json();
    },

    /**
     * Update an existing project.
     */
    updateProject: async (sessionId: string, data: ProjectUpdate): Promise<void> => {
        const response = await fetchWithAuth(`${API_ROOT}/projects/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Impossibile aggiornare il progetto');
        }
    },

    /**
     * Claims a guest project for the currently authenticated user.
     * This is used during the "Soft Login" flow (Deferred Auth).
     * 
     * @param sessionId - The ID of the project/session to claim.
     * @returns The JSON response from the backend.
     */
    claimProject: async (sessionId: string) => {
        const response = await fetchWithAuth(`${API_ROOT}/projects/${sessionId}/claim`, {
            method: 'POST',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Impossibile reclamare il progetto');
        }

        return response.json();
    },

    /**
     * Delete a project permanently.
     * 
     * @param sessionId - The ID of the project to delete.
     */
    deleteProject: async (sessionId: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ROOT}/projects/${sessionId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Impossibile eliminare il progetto');
        }
    },

    /**
     * Add file metadata to a project.
     */
    addProjectFile: async (sessionId: string, fileMetadata: { file_id: string, url: string, name: string, type: string, size: number }): Promise<void> => {
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
