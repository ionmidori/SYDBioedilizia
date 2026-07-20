import {
    documentUploadSchema,
    fileMetadataSchema,
    imageUploadSchema,
    validateFileForUpload,
    videoUploadSchema,
} from '../file-upload-schema';

const MB = 1024 * 1024;

/** Build a File whose reported size can exceed the actual byte content. */
function makeFile(name: string, mimeType: string, size: number): File {
    const file = new File(['x'], name, { type: mimeType });
    Object.defineProperty(file, 'size', { value: size });
    return file;
}

describe('validateFileForUpload', () => {
    it('accepts a JPEG under 10MB', () => {
        expect(validateFileForUpload(makeFile('a.jpg', 'image/jpeg', 2 * MB))).toEqual({
            valid: true,
            type: 'image',
        });
    });

    it('accepts a PDF under 25MB', () => {
        expect(validateFileForUpload(makeFile('a.pdf', 'application/pdf', 5 * MB))).toEqual({
            valid: true,
            type: 'document',
        });
    });

    it('accepts an MP4 under 100MB', () => {
        expect(validateFileForUpload(makeFile('a.mp4', 'video/mp4', 40 * MB))).toEqual({
            valid: true,
            type: 'video',
        });
    });

    it('rejects an image over the 10MB cap with the Italian message', () => {
        const result = validateFileForUpload(makeFile('big.png', 'image/png', 11 * MB));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('10MB');
    });

    it('rejects a document over the 25MB cap', () => {
        const result = validateFileForUpload(makeFile('big.pdf', 'application/pdf', 26 * MB));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('25MB');
    });

    it('rejects a video over the 100MB cap', () => {
        const result = validateFileForUpload(makeFile('big.mp4', 'video/mp4', 101 * MB));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('100MB');
    });

    it('rejects an image MIME type outside the allow-list', () => {
        const result = validateFileForUpload(makeFile('a.gif', 'image/gif', MB));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Formato immagine non supportato');
    });

    it('rejects an entirely unsupported type', () => {
        const result = validateFileForUpload(makeFile('a.zip', 'application/zip', MB));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Tipo di file non supportato');
    });
});

describe('per-type schemas', () => {
    it('imageUploadSchema pins type to the "image" literal', () => {
        const file = makeFile('a.png', 'image/png', MB);
        expect(
            imageUploadSchema.safeParse({ file, type: 'video', size: MB, mimeType: 'image/png' }).success
        ).toBe(false);
    });

    it('documentUploadSchema accepts only application/pdf', () => {
        const file = makeFile('a.txt', 'text/plain', MB);
        expect(
            documentUploadSchema.safeParse({ file, type: 'document', size: MB, mimeType: 'text/plain' })
                .success
        ).toBe(false);
    });

    it('videoUploadSchema accepts quicktime', () => {
        const file = makeFile('a.mov', 'video/quicktime', MB);
        expect(
            videoUploadSchema.safeParse({
                file,
                type: 'video',
                size: MB,
                mimeType: 'video/quicktime',
            }).success
        ).toBe(true);
    });

    it('rejects a non-File value for the file field', () => {
        expect(
            imageUploadSchema.safeParse({
                file: 'not-a-file',
                type: 'image',
                size: MB,
                mimeType: 'image/png',
            }).success
        ).toBe(false);
    });
});

describe('fileMetadataSchema', () => {
    const valid = {
        url: 'https://storage.googleapis.com/bucket/a.png',
        name: 'a.png',
        type: 'image' as const,
        size: 1234,
        uploadedAt: new Date(),
        uploadedBy: 'uid-1',
        projectId: 'proj-1',
    };

    it('accepts a complete record', () => {
        expect(fileMetadataSchema.safeParse(valid).success).toBe(true);
    });

    it.each([
        ['a malformed url', { url: 'not-a-url' }],
        ['an empty name', { name: '' }],
        ['a non-positive size', { size: 0 }],
        ['a string date', { uploadedAt: '2026-01-01' }],
        ['an empty projectId', { projectId: '' }],
    ])('rejects %s', (_label, override) => {
        expect(fileMetadataSchema.safeParse({ ...valid, ...override }).success).toBe(false);
    });
});
