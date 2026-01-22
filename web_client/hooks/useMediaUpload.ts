
import { useState, useCallback } from 'react';

export interface MediaUploadState {
    id: string; // unique ID for tracking
    file: File;
    previewUrl: string; // Blob URL for preview
    type: 'image' | 'video';
    progress: number; // 0-100
    status: 'idle' | 'compressing' | 'uploading' | 'done' | 'error';
    publicUrl?: string; // The final URL to send to backend
    errorMessage?: string;
    trimRange?: { start: number; end: number }; // NEW: Trim metadata
}

export function useMediaUpload(sessionId: string) {
    const [mediaItems, setMediaItems] = useState<MediaUploadState[]>([]);
    const [isGlobalUploading, setIsGlobalUploading] = useState(false);

    // Image Compression Logic (Ported from useImageUpload)
    const compressImage = async (file: File): Promise<Blob> => {
        // Simple compression for now, can expand with the aggressive logic if needed
        // For strict parity, we should ideally reuse the aggressive logic.
        // Let's assume for this step we keep it simple or copy the logic later.
        // For video task focus: standard Canvas compression.
        if (file.size <= 2 * 1024 * 1024) return file; // Skip if small

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxWidth = 1920;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Compression failed'));
                }, 'image/jpeg', 0.8);
                URL.revokeObjectURL(url);
            };
            img.onerror = reject;
            img.src = url;
        });
    };

    const uploadFile = async (item: MediaUploadState) => {
        // Update status
        updateItem(item.id, { status: item.type === 'image' ? 'compressing' : 'uploading' });

        try {
            let fileToUpload: Blob | File = item.file;

            // Compress if image
            if (item.type === 'image') {
                try {
                    fileToUpload = await compressImage(item.file);
                    updateItem(item.id, { status: 'uploading' });
                } catch (e) {
                    console.error('Compression failed', e);
                    // Fallback to original
                }
            }

            // 1. Get Signed URL
            const res = await fetch('/api/get-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    fileName: item.file.name,
                    contentType: item.file.type || 'application/octet-stream' // Ensure content type
                })
            });

            if (!res.ok) throw new Error('Failed to get upload URL');
            const { uploadUrl, publicUrl } = await res.json();

            // 2. Upload with XHR for Progress
            return new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                console.log('[Upload] Starting XHR upload:', {
                    fileName: item.file.name,
                    fileSize: item.file.size,
                    fileType: item.file.type,
                    uploadUrlPrefix: uploadUrl.substring(0, 50) + '...',
                });

                xhr.open('PUT', uploadUrl, true);
                xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        updateItem(item.id, { progress: percent });
                        console.log(`[Upload] Progress: ${percent}%`);
                    }
                };

                xhr.onload = () => {
                    console.log('[Upload] XHR onload triggered:', {
                        status: xhr.status,
                        statusText: xhr.statusText,
                        readyState: xhr.readyState,
                        responseText: xhr.responseText?.substring(0, 200)
                    });

                    if (xhr.status >= 200 && xhr.status < 300) {
                        updateItem(item.id, {
                            status: 'done',
                            progress: 100,
                            publicUrl: publicUrl
                        });
                        console.log('[Upload] Upload successful!');
                        resolve();
                    } else {
                        const errorMsg = `Upload failed: HTTP ${xhr.status} ${xhr.statusText}`;
                        console.error('[Upload] Upload failed:', {
                            status: xhr.status,
                            statusText: xhr.statusText,
                            response: xhr.responseText
                        });
                        reject(new Error(errorMsg));
                    }
                };

                xhr.onerror = (e) => {
                    console.error('[Upload] XHR onerror triggered:', {
                        event: e,
                        readyState: xhr.readyState,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        uploadUrl: uploadUrl.substring(0, 100),
                    });
                    reject(new Error('Network error during upload. Check console for details.'));
                };

                xhr.ontimeout = () => {
                    console.error('[Upload] XHR timeout');
                    reject(new Error('Upload timeout'));
                };

                xhr.onabort = () => {
                    console.error('[Upload] XHR aborted');
                    reject(new Error('Upload aborted'));
                };

                console.log('[Upload] Sending file...');
                xhr.send(fileToUpload);
            });

        } catch (error) {
            console.error(error);
            updateItem(item.id, {
                status: 'error',
                errorMessage: 'Upload failed'
            });
        }
    };

    const updateItem = (id: string, partial: Partial<MediaUploadState>) => {
        setMediaItems(prev => prev.map(i => i.id === id ? { ...i, ...partial } : i));
    };

    // Public wrapper for updating items (e.g. trimming)
    const updateMediaItem = (id: string, partial: Partial<MediaUploadState>) => {
        updateItem(id, partial);
    };

    const addFiles = useCallback(async (files: File[]) => {
        if (!sessionId) return;
        setIsGlobalUploading(true);

        const newItems: MediaUploadState[] = files.map(f => ({
            id: Math.random().toString(36).substr(2, 9),
            file: f,
            previewUrl: URL.createObjectURL(f),
            type: f.type.startsWith('image/') ? 'image' : 'video',
            progress: 0,
            status: 'idle'
        }));

        setMediaItems(prev => [...prev, ...newItems]);

        // Upload in parallel
        await Promise.all(newItems.map(item => uploadFile(item)));

        setIsGlobalUploading(false);
    }, [sessionId]);

    const removeMedia = (id: string) => {
        setMediaItems(prev => {
            const item = prev.find(i => i.id === id);
            if (item) URL.revokeObjectURL(item.previewUrl);
            return prev.filter(i => i.id !== id);
        });
    };

    const clearMedia = () => {
        mediaItems.forEach(i => URL.revokeObjectURL(i.previewUrl));
        setMediaItems([]);
    };

    return {
        mediaItems,
        addFiles,
        removeMedia,
        clearMedia,
        updateMediaItem, // Exported
        isGlobalUploading
    };
}
