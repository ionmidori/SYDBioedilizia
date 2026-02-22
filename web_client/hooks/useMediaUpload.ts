/**
 * Stub hook for backward compatibility with ChatWidget tests.
 * The actual media upload logic is handled by useUpload.
 */
export function useMediaUpload() {
    return {
        mediaItems: [],
        isGlobalUploading: false,
    };
}
