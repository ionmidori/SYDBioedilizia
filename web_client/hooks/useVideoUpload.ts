import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface VideoUploadState {
    id: string;
    file: File;
    previewUrl: string;
    fileName: string;
    fileSize: number;
    duration?: number;
    status: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
    progress: number; // 0-100
    fileUri?: string; // File API URI from backend
    errorMessage?: string;
}

export function useVideoUpload() {
    const { refreshToken } = useAuth();
    const [videos, setVideos] = useState<VideoUploadState[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [wakeLock, setWakeLock] = useState<any>(null); // 🔒 Wake Lock state

    /**
     * Request wake lock to prevent screen from sleeping during upload.
     */
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator && !wakeLock) {
                const lock = await (navigator as any).wakeLock.request('screen');
                setWakeLock(lock);
                console.log('[WakeLock] Screen wake lock acquired');
                return lock;
            }
        } catch (err) {
            console.log('[WakeLock] Request failed:', err);
        }
    };

    /**
     * Release wake lock when upload completes.
     */
    const releaseWakeLock = async () => {
        if (wakeLock) {
            try {
                await wakeLock.release();
                setWakeLock(null);
                console.log('[WakeLock] Screen wake lock released');
            } catch (err) {
                console.log('[WakeLock] Release failed:', err);
            }
        }
    };

    /**
     * Upload video to backend File API endpoint.
     * Returns the File API URI for use in chat requests.
     */
    const uploadVideo = async (video: VideoUploadState): Promise<string> => {
        // 🔒 Request wake lock at start of upload
        await requestWakeLock();

        try {
            setVideos(prev => prev.map(v =>
                v.id === video.id ? { ...v, status: 'uploading' as const, progress: 0 } : v
            ));

            // Get fresh auth token
            const token = await refreshToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            // Create FormData
            const formData = new FormData();
            formData.append('file', video.file);

            // Upload to backend /upload/video endpoint
            const xhr = new XMLHttpRequest();

            return new Promise((resolve, reject) => {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 50); // 0-50% for upload
                        setVideos(prev => prev.map(v =>
                            v.id === video.id ? { ...v, progress: percent } : v
                        ));
                    }
                };

                xhr.onload = async () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            const fileUri = response.file_uri;

                            // Set to processing state (waiting for File API to become ACTIVE)
                            setVideos(prev => prev.map(v =>
                                v.id === video.id ? {
                                    ...v,
                                    status: 'processing' as const,
                                    progress: 75
                                } : v
                            ));

                            // Simulate additional processing time for File API
                            // In production, backend already waits for ACTIVE state
                            await new Promise(r => setTimeout(r, 1000));

                            // Mark as done
                            setVideos(prev => prev.map(v =>
                                v.id === video.id ? {
                                    ...v,
                                    status: 'done' as const,
                                    progress: 100,
                                    fileUri
                                } : v
                            ));

                            resolve(fileUri);
                        } catch (e) {
                            reject(new Error('Invalid server response'));
                        }
                    } else {
                        const error = `Upload failed: ${xhr.status} ${xhr.statusText}`;
                        setVideos(prev => prev.map(v =>
                            v.id === video.id ? {
                                ...v,
                                status: 'error' as const,
                                errorMessage: error
                            } : v
                        ));
                        reject(new Error(error));
                    }
                };

                xhr.onerror = () => {
                    const error = 'Network error during upload';
                    setVideos(prev => prev.map(v =>
                        v.id === video.id ? {
                            ...v,
                            status: 'error' as const,
                            errorMessage: error
                        } : v
                    ));
                    reject(new Error(error));
                };

                xhr.open('POST', `${process.env.NEXT_PUBLIC_BACKEND_URL}/upload/video`);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.send(formData);
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
            setVideos(prev => prev.map(v =>
                v.id === video.id ? {
                    ...v,
                    status: 'error' as const,
                    errorMessage
                } : v
            ));
            throw error;
        } finally {
            // 🔒 Always release wake lock when upload finishes (success or failure)
            await releaseWakeLock();
        }
    };

    /**
     * Add video files and start upload process.
     * Returns array of File API URIs when all uploads complete.
     */
    const addVideos = useCallback(async (files: File[]): Promise<string[]> => {
        if (!files.length) return [];

        setIsUploading(true);

        // Create video states with preview URLs
        const newVideos: VideoUploadState[] = files.map(file => ({
            id: Math.random().toString(36).substring(2, 9),
            file,
            previewUrl: URL.createObjectURL(file),
            fileName: file.name,
            fileSize: file.size,
            status: 'idle' as const,
            progress: 0
        }));

        setVideos(prev => [...prev, ...newVideos]);

        try {
            // Upload all videos in parallel
            const fileUris = await Promise.all(
                newVideos.map(video => uploadVideo(video))
            );

            return fileUris;
        } catch (error) {
            console.error('[useVideoUpload] Upload failed:', error);
            throw error;
        } finally {
            setIsUploading(false);
        }
    }, []);

    const removeVideo = useCallback((id: string) => {
        setVideos(prev => {
            const video = prev.find(v => v.id === id);
            if (video) {
                URL.revokeObjectURL(video.previewUrl);
            }
            return prev.filter(v => v.id !== id);
        });
    }, []);

    const clearVideos = useCallback(async () => {
        videos.forEach(v => URL.revokeObjectURL(v.previewUrl));
        setVideos([]);
        // 🔒 Release wake lock when clearing all videos
        await releaseWakeLock();
    }, [videos, wakeLock]);

    return {
        videos,
        addVideos,
        removeVideo,
        clearVideos,
        isUploading
    };
}
