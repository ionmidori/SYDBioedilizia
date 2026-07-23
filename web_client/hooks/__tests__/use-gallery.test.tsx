import { galleryApi } from '@/lib/gallery-api';
import { createQueryWrapper } from '@/test-utils/query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGalleryAssets } from '../use-gallery';

jest.mock('@/lib/gallery-api', () => ({
    galleryApi: { listAssets: jest.fn() },
}));

const mockListAssets = galleryApi.listAssets as jest.Mock;

beforeEach(() => mockListAssets.mockReset());

describe('useGalleryAssets', () => {
    it('loads the first page with the requested limit', async () => {
        mockListAssets.mockResolvedValue({ assets: [{ id: 'a1' }], hasMore: false });

        const { result } = renderHook(() => useGalleryAssets(25), {
            wrapper: createQueryWrapper().wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockListAssets).toHaveBeenCalledWith(25, undefined);
        expect(result.current.hasNextPage).toBe(false);
    });

    it('pages forward using lastVisibleId as the cursor', async () => {
        mockListAssets
            .mockResolvedValueOnce({ assets: [{ id: 'a1' }], hasMore: true, lastVisibleId: 'a1' })
            .mockResolvedValueOnce({ assets: [{ id: 'a2' }], hasMore: false });

        const { result } = renderHook(() => useGalleryAssets(50), {
            wrapper: createQueryWrapper().wrapper,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.hasNextPage).toBe(true);

        await act(async () => {
            await result.current.fetchNextPage();
        });

        expect(mockListAssets).toHaveBeenLastCalledWith(50, 'a1');
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
        expect(result.current.hasNextPage).toBe(false);
    });

    it('does not fetch when disabled', () => {
        const { result } = renderHook(() => useGalleryAssets(50, false), {
            wrapper: createQueryWrapper().wrapper,
        });

        expect(result.current.fetchStatus).toBe('idle');
        expect(mockListAssets).not.toHaveBeenCalled();
    });
});
