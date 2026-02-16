'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, X, FileText, Image as ImageIcon, Video, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { validateFileForUpload } from '@/lib/validation/file-upload-schema';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export interface UploadedFile {
    file: File;
    id: string;
    preview?: string;
    progress: number;
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
    url?: string;
}

interface FileUploaderProps {
    projectId: string;
    onUploadComplete?: (files: UploadedFile[]) => void;
    maxFiles?: number;
}

export function FileUploader({ projectId, onUploadComplete, maxFiles = 10 }: FileUploaderProps) {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    const router = useRouter();

    // 🔧 Tier-3 Integration: Use Firebase Storage hook
    const { uploadFile: uploadToStorage, uploadProgress } = useFileUpload();

    // Sync hook progress to local file state
    useEffect(() => {
        uploadProgress.forEach((progress, fileId) => {
            setFiles(prev => prev.map(f => {
                // Match by fileId suffix (hook uses timestamp_filename format)
                if (f.id === fileId || fileId.endsWith(f.file.name)) {
                    return {
                        ...f,
                        progress: progress.progress,
                        status: progress.status === 'idle' ? 'pending' : progress.status,
                        url: progress.url,
                        error: progress.error,
                    };
                }
                return f;
            }));
        });
    }, [uploadProgress]);

    const addFiles = useCallback(async (newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles);
        const uploadedFiles: UploadedFile[] = [];

        for (const file of fileArray) {
            // Validate file
            const validation = validateFileForUpload(file);

            if (!validation.valid) {
                uploadedFiles.push({
                    file,
                    id: Math.random().toString(36).substring(7),
                    progress: 0,
                    status: 'error',
                    error: validation.error,
                });
                continue;
            }

            // Create preview for images
            let preview: string | undefined;
            if (file.type.startsWith('image/')) {
                preview = URL.createObjectURL(file);
            }

            uploadedFiles.push({
                file,
                id: Math.random().toString(36).substring(7),
                preview,
                progress: 0,
                status: 'pending',
            });
        }

        setFiles(prev => [...prev, ...uploadedFiles].slice(0, maxFiles));
    }, [maxFiles]);

    /**
     * Determines file type category for the backend
     */
    const getFileType = (file: File): 'image' | 'video' | 'document' => {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        return 'document';
    };

    /**
     * Upload a single file to Firebase Storage via the useFileUpload hook
     * Progress is automatically synced via the useEffect above
     */
    const uploadFileToStorage = async (fileData: UploadedFile): Promise<void> => {
        // Mark as uploading immediately for UI feedback
        setFiles(prev =>
            prev.map(f => f.id === fileData.id ? { ...f, status: 'uploading' as const } : f)
        );

        try {
            const fileType = getFileType(fileData.file);
            const downloadUrl = await uploadToStorage(fileData.file, projectId, fileType);

            // Explicitly set success state with URL
            setFiles(prev =>
                prev.map(f =>
                    f.id === fileData.id
                        ? { ...f, status: 'success' as const, url: downloadUrl, progress: 100 }
                        : f
                )
            );
        } catch (error: unknown) {
            console.error('[FileUploader] Upload failed:', error);

            // Map error to user-friendly message
            let errorMessage = 'Upload fallito. Riprova.';
            const err = error as { message?: string; code?: string };

            if (err?.message?.includes('not authenticated')) {
                errorMessage = 'Devi effettuare il login per caricare file.';
            } else if (err?.code === 'storage/unauthorized') {
                errorMessage = 'Non hai i permessi per caricare in questo progetto.';
            } else if (err?.code === 'storage/quota-exceeded') {
                errorMessage = 'Quota di storage esaurita.';
            }

            setFiles(prev =>
                prev.map(f =>
                    f.id === fileData.id
                        ? { ...f, status: 'error' as const, error: errorMessage }
                        : f
                )
            );
        }
    };

    /**
     * Upload all pending files in parallel
     * Calls onUploadComplete with successful uploads when all finish
     */
    const uploadAll = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');

        // Upload all in parallel
        await Promise.allSettled(pendingFiles.map(file => uploadFileToStorage(file)));

        // Wait a tick for state to settle, then call completion handler
        setTimeout(() => {
            setFiles(currentFiles => {
                const successFiles = currentFiles.filter(f => f.status === 'success');
                if (successFiles.length > 0) {
                    onUploadComplete?.(successFiles);
                }
                return currentFiles;
            });
        }, 100);
    };

    const removeFile = (id: string) => {
        setFiles(prev => {
            const file = prev.find(f => f.id === id);
            if (file?.preview) {
                URL.revokeObjectURL(file.preview);
            }
            return prev.filter(f => f.id !== id);
        });
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files) {
            addFiles(e.dataTransfer.files);
        }
    }, [addFiles]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addFiles(e.target.files);
        }
    };

    const getFileIcon = (file: File) => {
        if (file.type.startsWith('image/')) return <ImageIcon className="w-6 h-6" />;
        if (file.type.startsWith('video/')) return <Video className="w-6 h-6" />;
        return <FileText className="w-6 h-6" />;
    };

    const getStatusIcon = (status: UploadedFile['status']) => {
        switch (status) {
            case 'uploading':
                return <Loader2 className="w-5 h-5 text-luxury-gold animate-spin" />;
            case 'success':
                return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case 'error':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
            default:
                return null;
        }
    };

    const pendingCount = files.filter(f => f.status === 'pending').length;

    return (
        <div className="space-y-6">
            {/* Drop Zone */}
            {user?.isAnonymous ? (
                <div className="border-2 border-dashed border-luxury-gold/20 rounded-2xl p-12 text-center bg-white/5">
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-luxury-gold" />
                    <h3 className="text-xl font-bold text-luxury-text mb-2">
                        Login Richiesto
                    </h3>
                    <p className="text-luxury-text/60 mb-6">
                        Devi essere registrato per caricare file in questo progetto.
                    </p>
                    <button
                        onClick={() => router.push('/auth')}
                        className="px-6 py-2 bg-luxury-gold text-luxury-bg font-bold rounded-xl hover:bg-luxury-gold/90 transition-all"
                    >
                        Accedi o Registrati
                    </button>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`
                        relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
                        transition-all duration-300
                        ${isDragging
                            ? 'border-luxury-gold bg-luxury-gold/5 scale-105'
                            : 'border-luxury-gold/20 bg-white/5 hover:border-luxury-gold/40 hover:bg-white/10'
                        }
                    `}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,application/pdf,video/*"
                        onChange={handleFileInput}
                        className="hidden"
                    />

                    <Upload className="w-16 h-16 mx-auto mb-4 text-luxury-gold" />
                    <h3 className="text-xl font-bold text-luxury-text mb-2">
                        Trascina i file qui
                    </h3>
                    <p className="text-luxury-text/60">
                        oppure clicca per selezionare
                    </p>
                    <p className="text-sm text-luxury-text/40 mt-4">
                        Immagini (JPG, PNG, WEBP) • PDF • Video (MP4, MOV)
                    </p>
                    <p className="text-xs text-luxury-text/30 mt-2">
                        Max {maxFiles} file • Immagini: 10MB • PDF: 25MB • Video: 100MB
                    </p>
                </div>
            )}

            {/* File List */}
            {files.length > 0 && (
                <div className="space-y-3">
                    {files.map(fileData => (
                        <div
                            key={fileData.id}
                            className="glass-premium border-luxury-gold/10 p-4 rounded-xl flex items-center gap-4"
                        >
                            {/* File Icon/Preview */}
                            <div className="flex-shrink-0">
                                {fileData.preview ? (
                                    <img
                                        src={fileData.preview}
                                        alt={fileData.file.name}
                                        className="w-12 h-12 rounded-lg object-cover border border-luxury-gold/20"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-luxury-gold/10 flex items-center justify-center text-luxury-gold border border-luxury-gold/20">
                                        {getFileIcon(fileData.file)}
                                    </div>
                                )}
                            </div>

                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-luxury-text font-medium truncate">
                                    {fileData.file.name}
                                </p>
                                <p className="text-sm text-luxury-text/50">
                                    {(fileData.file.size / 1024 / 1024).toFixed(2)} MB
                                </p>

                                {/* Progress Bar */}
                                {fileData.status === 'uploading' && (
                                    <div className="mt-2 w-full bg-white/5 rounded-full h-1.5">
                                        <div
                                            className="bg-luxury-gold h-1.5 rounded-full transition-all"
                                            style={{ width: `${fileData.progress}%` }}
                                        />
                                    </div>
                                )}

                                {/* Error Message */}
                                {fileData.error && (
                                    <p className="text-xs text-red-400 mt-1">{fileData.error}</p>
                                )}
                            </div>

                            {/* Status Icon */}
                            <div className="flex-shrink-0">
                                {getStatusIcon(fileData.status)}
                            </div>

                            {/* Remove Button */}
                            <button
                                onClick={() => removeFile(fileData.id)}
                                className="flex-shrink-0 p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                                disabled={fileData.status === 'uploading'}
                            >
                                <X className="w-5 h-5 text-luxury-text/50 hover:text-red-400" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Button */}
            {pendingCount > 0 && (
                <button
                    onClick={uploadAll}
                    className="w-full px-6 py-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl hover:bg-luxury-gold/90 transition-all shadow-lg shadow-luxury-gold/20 flex items-center justify-center gap-3"
                >
                    <Upload className="w-5 h-5" />
                    Carica {pendingCount} {pendingCount === 1 ? 'File' : 'File'}
                </button>
            )}
        </div>
    );
}
