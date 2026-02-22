/**
 * Stub hook for backward compatibility with ChatWidget tests.
 * The actual video upload logic is handled by useUpload.
 */
export function useVideoUpload() {
    return {
        videos: [],
        isUploading: false,
    };
}
