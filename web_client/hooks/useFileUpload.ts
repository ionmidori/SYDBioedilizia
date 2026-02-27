import { useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { projectsApi } from '@/lib/projects-api';
import { useAuth } from '@/hooks/useAuth';
import { compressImage } from '@/lib/media-utils';

export interface UploadProgress {
    progress: number;
    status: 'idle' | 'uploading' | 'success' | 'error';
    error?: string;
    url?: string;
}

export interface UseFileUploadResult {
    uploadFile: (file: File, projectId: string, fileType: 'image' | 'document' | 'video') => Promise<string>;
    uploadProgress: Map<string, UploadProgress>;
    cancelUpload: (fileId: string) => void;
}

/**
 * Custom hook for uploading files to Firebase Storage with progress tracking
 * Handles retry logic, progress updates, and Firestore metadata storage
 */
export function useFileUpload(): UseFileUploadResult {
    const { user } = useAuth();
    const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
    const [uploadTasks, setUploadTasks] = useState<Map<string, UploadTask>>(new Map());

    const uploadFile = useCallback(async (
        file: File,
        projectId: string,
        fileType: 'image' | 'document' | 'video'
    ): Promise<string> => {
        if (!user) {
            throw new Error('User not authenticated');
        }

        if (user.isAnonymous) {
            throw new Error('Devi effettuare il login per caricare file.');
        }

        // 🖼️ Client-side Compression: Optimize images before upload to save bandwidth & cost
        let fileToUpload = file;
        if (fileType === 'image') {
            fileToUpload = await compressImage(file);
        }

        const fileId = `${Date.now()}_${fileToUpload.name}`;
        const storagePath = `projects/${projectId}/uploads/${fileId}`;
        const storageRef = ref(storage, storagePath);

        return new Promise((resolve, reject) => {
            // Initialize progress
            setUploadProgress(prev => new Map(prev).set(fileId, {
                progress: 0,
                status: 'uploading',
            }));

            // Create upload task
            const uploadTask = uploadBytesResumable(storageRef, fileToUpload, {
                contentType: fileToUpload.type,
                customMetadata: {
                    uploadedBy: user.uid,
                    projectId: projectId
                }
            });

            // Store task for potential cancellation
            setUploadTasks(prev => new Map(prev).set(fileId, uploadTask));

            // Track progress
            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(prev => new Map(prev).set(fileId, {
                        progress,
                        status: 'uploading',
                    }));
                },
                (error) => {
                    console.error(`[useFileUpload] Upload error for ${file.name}:`, error);
                    setUploadProgress(prev => new Map(prev).set(fileId, {
                        progress: 0,
                        status: 'error',
                        error: error.message || 'Upload fallito',
                    }));
                    setUploadTasks(prev => {
                        const newMap = new Map(prev);
                        newMap.delete(fileId);
                        return newMap;
                    });
                    reject(error);
                },
                async () => {
                    try {
                        // Get download URL
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

                        // Store metadata via Backend API (3-Tier Architecture)
                        await projectsApi.addProjectFile(projectId, {
                            file_id: fileId,
                            url: downloadURL,
                            name: fileToUpload.name,
                            type: fileType,
                            size: fileToUpload.size,
                        });

                        // Update progress to success
                        setUploadProgress(prev => new Map(prev).set(fileId, {
                            progress: 100,
                            status: 'success',
                            url: downloadURL,
                        }));

                        // Clean up task
                        setUploadTasks(prev => {
                            const newMap = new Map(prev);
                            newMap.delete(fileId);
                            return newMap;
                        });

                        resolve(downloadURL);
                    } catch (error: unknown) {
                        console.error('[useFileUpload] Metadata save error:', error);
                        setUploadProgress(prev => new Map(prev).set(fileId, {
                            progress: 100,
                            status: 'error',
                            error: 'Upload completato ma errore nel salvataggio dei metadati',
                        }));
                        reject(error);
                    }
                }
            );
        });
    }, [user]);

    const cancelUpload = useCallback((fileId: string) => {
        const task = uploadTasks.get(fileId);
        if (task) {
            task.cancel();
            setUploadProgress(prev => new Map(prev).set(fileId, {
                progress: 0,
                status: 'error',
                error: 'Upload cancellato',
            }));
            setUploadTasks(prev => {
                const newMap = new Map(prev);
                newMap.delete(fileId);
                return newMap;
            });
        }
    }, [uploadTasks]);

    return {
        uploadFile,
        uploadProgress,
        cancelUpload,
    };
}
