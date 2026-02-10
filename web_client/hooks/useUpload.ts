/**
 * Unified Upload Hook.
 *
 * A production-ready hook for handling file uploads with:
 * - Unified state management for images and videos
 * - AbortController for request cancellation
 * - Wake Lock to prevent screen sleep during uploads
 * - Automatic compression for large images
 *
 * @example
 * ```tsx
 * const { uploads, addFiles, removeFile } = useUpload();
 *
 * // Add files from input
 * const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
 *   if (e.target.files) addFiles(Array.from(e.target.files));
 * };
 *
 * // Cancel an upload
 * const handleCancel = (id: string) => removeFile(id);
 * ```
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '@/lib/firebase';
import { useAuth } from './useAuth';
import type { UploadItem, UploadStatus, MediaAsset } from '@/types/media';
import {
    compressImage,
    shouldCompress,
    getUploadEndpoint,
    isAllowedType,
} from '@/lib/compression-utils';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface UseUploadOptions {
    /** Maximum file size in bytes (default: 100MB) */
    maxSize?: number;
    /** Allowed MIME type patterns (default: image/*, video/*) */
    allowedTypes?: string[];
    /** Session ID for image uploads */
    sessionId?: string;
}

const DEFAULT_OPTIONS: Required<UseUploadOptions> = {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['image/*', 'video/*'],
    sessionId: '',
};

// =============================================================================
// HOOK
// =============================================================================

export function useUpload(options: UseUploadOptions = {}) {
    const { maxSize, allowedTypes, sessionId } = { ...DEFAULT_OPTIONS, ...options };
    const { user, refreshToken, signInAnonymously } = useAuth();

    // State: Record of uploads keyed by ID
    const [uploads, setUploads] = useState<Record<string, UploadItem>>({});

    // Wake Lock reference
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const activeUploadsRef = useRef<number>(0);

    // ==========================================================================
    // WAKE LOCK MANAGEMENT
    // ==========================================================================

    const requestWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator && !wakeLockRef.current) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                console.log('[useUpload] 🔒 Screen wake lock acquired');
            }
        } catch (err) {
            console.log('[useUpload] Wake lock request failed:', err);
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
                console.log('[useUpload] 🔓 Screen wake lock released');
            } catch (err) {
                console.log('[useUpload] Wake lock release failed:', err);
            }
        }
    }, []);

    // Auto-release wake lock when all uploads complete
    useEffect(() => {
        const activeCount = Object.values(uploads).filter(
            (u) => u.status === 'uploading' || u.status === 'compressing'
        ).length;

        if (activeCount === 0 && wakeLockRef.current) {
            releaseWakeLock();
        }
    }, [uploads, releaseWakeLock]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            releaseWakeLock();
        };
    }, [releaseWakeLock]);

    // ==========================================================================
    // HELPER: Update single item
    // ==========================================================================

    const updateItem = useCallback(
        (id: string, partial: Partial<UploadItem>) => {
            setUploads((prev) => ({
                ...prev,
                [id]: { ...prev[id], ...partial },
            }));
        },
        []
    );

    // ==========================================================================
    // PROCESS SINGLE UPLOAD
    // ==========================================================================

    const processUpload = useCallback(
        async (item: UploadItem) => {
            const controller = new AbortController();
            updateItem(item.id, { abortController: controller });

            try {
                // Acquire wake lock at start
                activeUploadsRef.current++;
                if (activeUploadsRef.current === 1) {
                    await requestWakeLock();
                }

                let fileToUpload: File | Blob = item.file;

                // COMPRESSION STRATEGY: Compress images
                if (shouldCompress(item.file.type)) {
                    updateItem(item.id, { status: 'compressing', progress: 10 });
                    try {
                        const compressed = await compressImage(item.file);
                        fileToUpload = new File([compressed], item.file.name, {
                            type: 'image/jpeg',
                        });
                        console.log(
                            `[useUpload] Compressed ${item.file.name}: ${(item.file.size / 1024 / 1024).toFixed(2)}MB -> ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`
                        );
                    } catch (err) {
                        console.error('[useUpload] Compression failed, using original:', err);
                    }
                }

                // GET UPLOAD ENDPOINT
                const endpoint = getUploadEndpoint(item.file.type);

                // GET AUTH TOKEN & ENSURE IDENTITY
                updateItem(item.id, { status: 'uploading', progress: 20 });

                // ⚡ Anonymous sign-in if guest
                if (!user) {
                    console.log('[useUpload] No user found, attempting anonymous sign-in...');
                    await signInAnonymously();
                }

                const token = await refreshToken();
                if (!token) {
                    throw new Error('Authentication required');
                }

                // GET APP CHECK TOKEN (⚡ Production Protection)
                let appCheckToken: string | undefined;
                if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true' && appCheck) {
                    try {
                        const result = await getToken(appCheck, false);
                        appCheckToken = result.token;
                    } catch (error) {
                        console.debug('[useUpload] App Check suppressed:', error);
                    }
                }

                // BUILD FORM DATA
                const formData = new FormData();
                formData.append('file', fileToUpload);
                if (sessionId && item.file.type.startsWith('image/')) {
                    formData.append('session_id', sessionId);
                }

                // UPLOAD with XHR for progress tracking
                const result = await new Promise<MediaAsset>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 80) + 20; // 20-100%
                            updateItem(item.id, { progress: percent });
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const response = JSON.parse(xhr.responseText);
                                resolve(response as MediaAsset);
                            } catch {
                                reject(new Error('Invalid server response'));
                            }
                        } else {
                            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                        }
                    };

                    xhr.onerror = () => reject(new Error('Network error during upload'));
                    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

                    // Handle AbortController
                    controller.signal.addEventListener('abort', () => xhr.abort());

                    xhr.open('POST', endpoint);
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                    if (appCheckToken) {
                        xhr.setRequestHeader('X-Firebase-AppCheck', appCheckToken);
                    }
                    xhr.send(formData);
                });

                // SUCCESS
                updateItem(item.id, {
                    status: 'success',
                    progress: 100,
                    serverData: result,
                });
                console.log(`[useUpload] ✅ Upload complete: ${item.file.name}`);

            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    console.log(`[useUpload] Upload cancelled: ${item.file.name}`);
                    return; // Don't update state, item is being removed
                }

                const error = err instanceof Error ? err.message : 'Upload failed';
                updateItem(item.id, { status: 'error', error });
                console.error(`[useUpload] ❌ Upload failed: ${item.file.name}`, err);

            } finally {
                activeUploadsRef.current--;
                if (activeUploadsRef.current === 0) {
                    await releaseWakeLock();
                }
            }
        },
        [refreshToken, sessionId, updateItem, requestWakeLock, releaseWakeLock]
    );

    // ==========================================================================
    // ADD FILES
    // ==========================================================================

    const addFiles = useCallback(
        async (files: File[]) => {
            const validFiles: UploadItem[] = [];

            for (const file of files) {
                // Validate type
                if (!isAllowedType(file, allowedTypes)) {
                    console.warn(`[useUpload] Skipping unsupported file: ${file.name} (${file.type})`);
                    continue;
                }

                // Validate size
                if (file.size > maxSize) {
                    console.warn(`[useUpload] Skipping oversized file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
                    continue;
                }

                // Create item with UUID
                const id = crypto.randomUUID();
                const item: UploadItem = {
                    id,
                    file,
                    previewUrl: URL.createObjectURL(file),
                    progress: 0,
                    status: 'idle',
                };

                validFiles.push(item);
            }

            if (validFiles.length === 0) return;

            // Optimistic UI update
            const newUploads: Record<string, UploadItem> = {};
            validFiles.forEach((item) => {
                newUploads[item.id] = item;
            });
            setUploads((prev) => ({ ...prev, ...newUploads }));

            // Process uploads in parallel
            validFiles.forEach((item) => processUpload(item));
        },
        [allowedTypes, maxSize, processUpload]
    );

    // ==========================================================================
    // REMOVE FILE
    // ==========================================================================

    const removeFile = useCallback((id: string) => {
        setUploads((prev) => {
            const item = prev[id];
            if (!item) return prev;

            // Abort pending request
            if (item.abortController) {
                item.abortController.abort();
            }

            // Revoke blob URL to free memory
            URL.revokeObjectURL(item.previewUrl);

            // Remove from state
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    // ==========================================================================
    // RETRY FAILED UPLOAD
    // ==========================================================================

    const retryUpload = useCallback(
        (id: string) => {
            setUploads((prev) => {
                const item = prev[id];
                if (!item || item.status !== 'error') return prev;

                // Reset item state
                return {
                    ...prev,
                    [id]: {
                        ...item,
                        status: 'idle' as UploadStatus,
                        progress: 0,
                        error: undefined,
                        abortController: undefined,
                    },
                };
            });

            // Re-process after state update
            setTimeout(() => {
                const item = uploads[id];
                if (item) processUpload(item);
            }, 0);
        },
        [uploads, processUpload]
    );

    // ==========================================================================
    // CLEAR ALL
    // ==========================================================================

    const clearAll = useCallback(() => {
        Object.values(uploads).forEach((item) => {
            if (item.abortController) item.abortController.abort();
            URL.revokeObjectURL(item.previewUrl);
        });
        setUploads({});
    }, [uploads]);

    // ==========================================================================
    // COMPUTED VALUES
    // ==========================================================================

    const isUploading = Object.values(uploads).some(
        (u) => u.status === 'uploading' || u.status === 'compressing'
    );

    const successfulUploads = Object.values(uploads).filter((u) => u.status === 'success');

    return {
        uploads,
        addFiles,
        removeFile,
        retryUpload,
        clearAll,
        isUploading,
        successfulUploads,
    };
}
