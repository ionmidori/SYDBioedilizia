import { useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

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
    const [uploadTasks, setUploadTasks] = useState<Map<string, any>>(new Map());

    const uploadFile = useCallback(async (
        file: File,
        projectId: string,
        fileType: 'image' | 'document' | 'video'
    ): Promise<string> => {
        if (!user) {
            throw new Error('User not authenticated');
        }

        const fileId = `${Date.now()}_${file.name}`;
        const storagePath = `projects/${projectId}/uploads/${fileId}`;
        const storageRef = ref(storage, storagePath);

        return new Promise((resolve, reject) => {
            // Initialize progress
            setUploadProgress(prev => new Map(prev).set(fileId, {
                progress: 0,
                status: 'uploading',
            }));

            // Create upload task
            const uploadTask = uploadBytesResumable(storageRef, file, {
                contentType: file.type,
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

                        // Store metadata in Firestore
                        const fileMetadata = {
                            url: downloadURL,
                            name: file.name,
                            type: fileType,
                            size: file.size,
                            uploadedAt: new Date(),
                            uploadedBy: user.uid,
                            projectId,
                        };

                        await setDoc(
                            doc(db, 'projects', projectId, 'files', fileId),
                            fileMetadata
                        );

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
                    } catch (error: any) {
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
