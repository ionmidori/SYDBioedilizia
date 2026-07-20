import type { Message } from '@/types/chat';
import imageCompression from 'browser-image-compression';
import {
    compressImage,
    extractMediaFromMessages,
    groupAssetsByType,
    validateVideo,
    type MediaAsset,
} from '../media-utils';

jest.mock('browser-image-compression', () => ({
    __esModule: true,
    default: jest.fn(),
}));

const mockCompression = imageCompression as jest.MockedFunction<typeof imageCompression>;
const MB = 1024 * 1024;

function makeFile(name: string, type: string, size: number): File {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
}

function msg(overrides: Partial<Message>): Message {
    return { id: 'm1', role: 'assistant', content: '', ...overrides } as Message;
}

describe('extractMediaFromMessages', () => {
    it('returns nothing for messages without media', () => {
        expect(extractMediaFromMessages([msg({ content: 'ciao' })])).toEqual([]);
    });

    it('extracts image and video attachments with stable ids', () => {
        const assets = extractMediaFromMessages([
            msg({ attachments: { images: ['https://a/1.png'], videos: ['https://a/1.mp4'] } }),
        ]);
        expect(assets).toHaveLength(2);
        expect(assets.map((a) => a.id).sort()).toEqual(['m1-image-0', 'm1-video-0']);
        expect(assets.find((a) => a.type === 'video')?.url).toBe('https://a/1.mp4');
    });

    it('picks up markdown images on a recognised host', () => {
        const assets = extractMediaFromMessages([
            msg({ content: '![Cucina](https://storage.googleapis.com/b/cucina.webp)' }),
        ]);
        expect(assets).toHaveLength(1);
        expect(assets[0].title).toBe('Cucina');
    });

    it('classifies a markdown image as a render when the url says so', () => {
        const assets = extractMediaFromMessages([
            msg({ content: '![out](https://storage.googleapis.com/b/render-42.png)' }),
        ]);
        expect(assets[0].type).toBe('render');
    });

    it('ignores markdown images from unrecognised hosts/extensions', () => {
        const assets = extractMediaFromMessages([msg({ content: '![x](https://evil.test/a.svg)' })]);
        expect(assets).toEqual([]);
    });

    it('extracts PDF quote links', () => {
        const assets = extractMediaFromMessages([
            msg({ content: '[Preventivo.pdf](https://storage.googleapis.com/b/p.pdf)' }),
        ]);
        expect(assets).toHaveLength(1);
        expect(assets[0].type).toBe('quote');
        expect(assets[0].title).toBe('Preventivo.pdf');
    });

    it('aggregates across several messages', () => {
        const assets = extractMediaFromMessages([
            msg({ id: 'a', attachments: { images: ['https://a/1.png'] } }),
            msg({ id: 'b', attachments: { images: ['https://a/2.png'] } }),
        ]);
        expect(assets.map((a) => a.messageId)).toEqual(['b', 'a']); // newest first
    });
});

describe('compressImage', () => {
    beforeEach(() => mockCompression.mockReset());

    it('passes through non-image files untouched', async () => {
        const file = makeFile('a.pdf', 'application/pdf', 5 * MB);
        await expect(compressImage(file)).resolves.toBe(file);
        expect(mockCompression).not.toHaveBeenCalled();
    });

    it('skips images already under 500KB', async () => {
        const file = makeFile('small.png', 'image/png', 100 * 1024);
        await expect(compressImage(file)).resolves.toBe(file);
        expect(mockCompression).not.toHaveBeenCalled();
    });

    it('compresses a large image to WebP at 1920px', async () => {
        const file = makeFile('big.png', 'image/png', 4 * MB);
        const compressed = makeFile('big.webp', 'image/webp', MB);
        mockCompression.mockResolvedValue(compressed);

        await expect(compressImage(file)).resolves.toBe(compressed);
        expect(mockCompression).toHaveBeenCalledWith(
            file,
            expect.objectContaining({ maxWidthOrHeight: 1920, fileType: 'image/webp' })
        );
    });

    it('falls back to the original file when compression fails', async () => {
        const file = makeFile('big.png', 'image/png', 4 * MB);
        mockCompression.mockRejectedValue(new Error('worker died'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(compressImage(file)).resolves.toBe(file);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('validateVideo', () => {
    it('ignores non-video files', async () => {
        await expect(validateVideo(makeFile('a.png', 'image/png', 200 * MB))).resolves.toEqual({
            valid: true,
        });
    });

    it('accepts a video under 50MB', async () => {
        await expect(validateVideo(makeFile('a.mp4', 'video/mp4', 20 * MB))).resolves.toEqual({
            valid: true,
        });
    });

    it('rejects a video over 50MB with an Italian message', async () => {
        const result = await validateVideo(makeFile('a.mp4', 'video/mp4', 51 * MB));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('50MB');
    });
});

describe('groupAssetsByType', () => {
    it('returns an empty object for no assets', () => {
        expect(groupAssetsByType([])).toEqual({});
    });

    it('buckets assets by their type', () => {
        const assets = [
            { id: '1', type: 'image', url: 'u1', timestamp: 't' },
            { id: '2', type: 'image', url: 'u2', timestamp: 't' },
            { id: '3', type: 'quote', url: 'u3', timestamp: 't' },
        ] as MediaAsset[];

        const grouped = groupAssetsByType(assets);
        expect(Object.keys(grouped).sort()).toEqual(['image', 'quote']);
        expect(grouped.image).toHaveLength(2);
        expect(grouped.quote[0].id).toBe('3');
    });
});
