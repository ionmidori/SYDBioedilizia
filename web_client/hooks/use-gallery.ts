import { useInfiniteQuery } from '@tanstack/react-query';
import { galleryApi } from '@/lib/gallery-api';

export function useGalleryAssets(limit: number = 50, enabled: boolean = true) {
    return useInfiniteQuery({
        queryKey: ['gallery', 'assets', limit],
        queryFn: async ({ pageParam }) => {
            return galleryApi.listAssets(limit, pageParam as string | undefined);
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => {
            if (lastPage.hasMore) {
                return lastPage.lastVisibleId;
            }
            return undefined;
        },
        enabled: enabled,
    });
}
