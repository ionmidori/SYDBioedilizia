import { fetchWithAuth } from '@/lib/api-client';
import type { UserPreferences } from '@/lib/validation/profile-schema';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

export const usersApi = {
    /**
     * Get user preferences.
     */
    getPreferences: async (): Promise<UserPreferences> => {
        const response = await fetchWithAuth(`${API_ROOT}/users/preferences`);
        if (!response.ok) {
            throw new Error('Impossibile caricare le preferenze');
        }
        return response.json();
    },

    /**
     * Update user preferences.
     */
    updatePreferences: async (updates: Partial<UserPreferences>): Promise<void> => {
        const response = await fetchWithAuth(`${API_ROOT}/users/preferences`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            throw new Error('Impossibile aggiornare le preferenze');
        }
    }
};
