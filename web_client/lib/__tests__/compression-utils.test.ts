import {
    compressImage,
    getUploadEndpoint,
    isAllowedType,
    shouldCompress,
} from '../compression-utils';

const MB = 1024 * 1024;

function makeFile(name: string, type: string, size: number): File {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
}

describe('getUploadEndpoint', () => {
    it.each([
        ['image/jpeg', '/api/py/upload/image'],
        ['image/webp', '/api/py/upload/image'],
        ['video/mp4', '/api/py/upload/video'],
        ['application/pdf', '/api/py/upload/document'],
    ])('routes %s to %s', (mimeType, endpoint) => {
        expect(getUploadEndpoint(mimeType)).toBe(endpoint);
    });

    it('throws on an unsupported type', () => {
        expect(() => getUploadEndpoint('application/zip')).toThrow('Unsupported file type');
    });
});

describe('shouldCompress', () => {
    it('compresses only images', () => {
        expect(shouldCompress('image/png')).toBe(true);
        expect(shouldCompress('video/mp4')).toBe(false);
        expect(shouldCompress('application/pdf')).toBe(false);
    });
});

describe('isAllowedType', () => {
    it('matches a wildcard pattern', () => {
        expect(isAllowedType(makeFile('a.png', 'image/png', 1), ['image/*'])).toBe(true);
    });

    it('matches an exact MIME type', () => {
        expect(isAllowedType(makeFile('a.pdf', 'application/pdf', 1), ['application/pdf'])).toBe(
            true
        );
    });

    it('rejects anything outside the list', () => {
        expect(isAllowedType(makeFile('a.zip', 'application/zip', 1), ['image/*', 'video/*'])).toBe(
            false
        );
    });
});

describe('compressImage', () => {
    // jsdom has no real Image loading, canvas, or object URLs: fake all three
    // and drive the onload/onerror callbacks explicitly.
    let imageShouldFail = false;
    let imageSize = { width: 4000, height: 2000 };
    const drawImage = jest.fn();
    const toBlob = jest.fn();
    const getContext = jest.fn();
    const fakeCanvas = { width: 0, height: 0, getContext, toBlob };

    const realCreateElement = document.createElement.bind(document);
    let logSpy: jest.SpyInstance;

    class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = imageSize.width;
        height = imageSize.height;
        set src(_value: string) {
            setTimeout(() => (imageShouldFail ? this.onerror?.() : this.onload?.()), 0);
        }
    }

    beforeAll(() => {
        global.Image = FakeImage as unknown as typeof Image;
        URL.createObjectURL = jest.fn(() => 'blob:mock');
        URL.revokeObjectURL = jest.fn();
        jest.spyOn(document, 'createElement').mockImplementation((tag: string) =>
            tag === 'canvas' ? (fakeCanvas as unknown as HTMLElement) : realCreateElement(tag)
        );
    });

    beforeEach(() => {
        imageShouldFail = false;
        imageSize = { width: 4000, height: 2000 };
        drawImage.mockClear();
        getContext.mockReset().mockReturnValue({ drawImage });
        toBlob.mockReset().mockImplementation((cb: (b: Blob | null) => void) =>
            cb({ size: 1 * MB } as Blob)
        );
        // getCompressionConfig logs its tier via logger.debug (console.log in test env)
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => logSpy.mockRestore());

    it('scales a wide image down to the standard 2048px width', async () => {
        await compressImage(makeFile('a.jpg', 'image/jpeg', 5 * MB));
        expect(fakeCanvas.width).toBe(2048);
        expect(fakeCanvas.height).toBe(1024); // aspect ratio preserved
        expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    });

    it('uses the extreme tier (1024px, q=0.5) for files over 8x the target', async () => {
        await compressImage(makeFile('huge.jpg', 'image/jpeg', 90 * MB));
        expect(fakeCanvas.width).toBe(1024);
        expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.5);
    });

    it('leaves images narrower than maxWidth at their own size', async () => {
        imageSize = { width: 800, height: 600 };
        await compressImage(makeFile('small.jpg', 'image/jpeg', 1 * MB));
        expect(fakeCanvas.width).toBe(800);
        expect(fakeCanvas.height).toBe(600);
    });

    it('honours an explicit config override', async () => {
        await compressImage(makeFile('a.jpg', 'image/jpeg', 1 * MB), {
            maxWidth: 640,
            quality: 0.4,
            mimeType: 'image/webp',
        });
        expect(fakeCanvas.width).toBe(640);
        expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.4);
    });

    it('retries at 50% quality when the first pass is still over 10MB', async () => {
        toBlob
            .mockImplementationOnce((cb: (b: Blob | null) => void) => cb({ size: 12 * MB } as Blob))
            .mockImplementationOnce((cb: (b: Blob | null) => void) => cb({ size: 4 * MB } as Blob));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const blob = await compressImage(makeFile('a.jpg', 'image/jpeg', 5 * MB));

        expect(blob.size).toBe(4 * MB);
        expect(toBlob).toHaveBeenCalledTimes(2);
        expect(toBlob.mock.calls[1][2]).toBe(0.5);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('rejects when the canvas context is unavailable', async () => {
        getContext.mockReturnValue(null);
        await expect(compressImage(makeFile('a.jpg', 'image/jpeg', MB))).rejects.toThrow(
            'Canvas context not available'
        );
    });

    it('rejects when toBlob produces nothing', async () => {
        toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null));
        await expect(compressImage(makeFile('a.jpg', 'image/jpeg', MB))).rejects.toThrow(
            'Image compression failed'
        );
    });

    it('rejects and revokes the object URL when the image fails to load', async () => {
        imageShouldFail = true;
        await expect(compressImage(makeFile('bad.jpg', 'image/jpeg', MB))).rejects.toThrow(
            'Failed to load image for compression'
        );
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });
});
