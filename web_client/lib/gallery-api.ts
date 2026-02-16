import { fetchWithAuth } from '@/lib/api-client';
import { MediaAsset } from '@/lib/media-utils';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

interface GalleryResponse {
    assets: MediaAsset[];
    hasMore: boolean;
    lastVisibleId?: string;
}

export const galleryApi = {
    listAssets: async (limit: number = 50, lastId?: string): Promise<GalleryResponse> => {
        const queryParams = new URLSearchParams({
            limit: limit.toString()
        });
        if (lastId) {
            queryParams.append('last_id', lastId);
        }

        const response = await fetchWithAuth(`${API_ROOT}/reports/gallery?${queryParams.toString()}`);
        if (!response.ok) {
            throw new Error('Impossibile caricare la galleria');
        }

        const data = await response.json();

        // Convert ISO strings back to Date objects
        return {
            ...data,
            assets: data.assets.map((asset: any) => ({
                ...asset,
                createdAt: new Date(asset.createdAt),
                timestamp: new Date(asset.timestamp)
            }))
        };
    }
};
