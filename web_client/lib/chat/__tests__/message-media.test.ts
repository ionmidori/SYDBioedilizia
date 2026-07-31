import type { UploadItem, ImageMediaAsset, VideoMediaAsset } from '@/types/media';
import { buildMediaPayload } from '../message-media';

function makeImageUpload(overrides: Partial<ImageMediaAsset> = {}): UploadItem {
    const serverData: ImageMediaAsset = {
        id: 'img-1',
        url: 'https://cdn.example.com/img-1.jpg',
        filename: 'kitchen.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 12345,
        asset_type: 'image',
        file_path: 'user-uploads/img-1.jpg',
        ...overrides,
    };
    return {
        id: 'upload-img-1',
        file: new File([], 'kitchen.jpg'),
        previewUrl: 'blob:preview',
        progress: 100,
        status: 'success',
        serverData,
    };
}

function makeVideoUpload(overrides: Partial<VideoMediaAsset> = {}): UploadItem {
    const serverData: VideoMediaAsset = {
        id: 'vid-1',
        url: 'https://cdn.example.com/vid-1.mp4',
        filename: 'walkthrough.mp4',
        mime_type: 'video/mp4',
        size_bytes: 999999,
        asset_type: 'video',
        file_uri: 'files/vid-1-file-uri',
        state: 'ACTIVE',
        ...overrides,
    };
    return {
        id: 'upload-vid-1',
        file: new File([], 'walkthrough.mp4'),
        previewUrl: 'blob:preview',
        progress: 100,
        status: 'success',
        serverData,
    };
}

describe('buildMediaPayload', () => {
    it('returns empty payload for no uploads', () => {
        expect(buildMediaPayload([])).toEqual({
            mediaUrls: [],
            mediaMetadata: {},
            videoFileUris: undefined,
        });
    });

    it('collects image URLs and metadata, omitting videoFileUris', () => {
        const upload = makeImageUpload();
        const payload = buildMediaPayload([upload]);

        expect(payload.mediaUrls).toEqual(['https://cdn.example.com/img-1.jpg']);
        expect(payload.videoFileUris).toBeUndefined();
        expect(payload.mediaMetadata['https://cdn.example.com/img-1.jpg']).toEqual({
            mimeType: 'image/jpeg',
            fileSize: 12345,
            originalFileName: 'kitchen.jpg',
        });
    });

    it('collects video file URIs separately from mediaUrls', () => {
        const upload = makeVideoUpload();
        const payload = buildMediaPayload([upload]);

        expect(payload.mediaUrls).toEqual([]);
        expect(payload.videoFileUris).toEqual(['files/vid-1-file-uri']);
        expect(payload.mediaMetadata['https://cdn.example.com/vid-1.mp4']).toEqual({
            mimeType: 'video/mp4',
            fileSize: 999999,
            originalFileName: 'walkthrough.mp4',
        });
    });

    it('handles a mix of images and videos', () => {
        const image = makeImageUpload({ url: 'https://cdn.example.com/a.jpg' });
        const video = makeVideoUpload({ url: 'https://cdn.example.com/b.mp4', file_uri: 'files/b' });
        const payload = buildMediaPayload([image, video]);

        expect(payload.mediaUrls).toEqual(['https://cdn.example.com/a.jpg']);
        expect(payload.videoFileUris).toEqual(['files/b']);
        expect(Object.keys(payload.mediaMetadata)).toEqual([
            'https://cdn.example.com/a.jpg',
            'https://cdn.example.com/b.mp4',
        ]);
    });

    it('ignores uploads without serverData (still in progress)', () => {
        const pending: UploadItem = {
            id: 'upload-pending',
            file: new File([], 'pending.jpg'),
            previewUrl: 'blob:preview',
            progress: 40,
            status: 'uploading',
        };
        expect(buildMediaPayload([pending])).toEqual({
            mediaUrls: [],
            mediaMetadata: {},
            videoFileUris: undefined,
        });
    });
});
