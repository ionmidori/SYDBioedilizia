'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, FileText, Image, Video, CheckCircle2, AlertCircle, Loader2, FolderKanban } from 'lucide-react';
import { validateFileForUpload } from '@/lib/validation/file-upload-schema';
import { cn } from '@/lib/utils';
import { useFileUpload, UploadProgress } from '@/hooks/useFileUpload';
import { motion, AnimatePresence } from 'framer-motion';

export interface UploadedFile {
    file: File;
    id: string;
    preview?: string;
    progress: number;
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
    url?: string;
}

interface Project {
    id: string;
    name: string;
}

interface GlobalFileUploaderProps {
    projects: Project[];
    onUploadComplete?: () => void;
    maxFiles?: number;
}

export function GlobalFileUploader({ projects, onUploadComplete, maxFiles = 10 }: GlobalFileUploaderProps) {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadFile, uploadProgress } = useFileUpload();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Filter out uploaded files from file list update
    const updateFileStatus = useCallback((fileId: string, status: UploadedFile['status'], progress: number, error?: string) => {
        setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
                return { ...f, status, progress, error };
            }
            return f;
        }));
    }, []);

    const addFiles = useCallback((newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles);
        const uploadedFiles: UploadedFile[] = [];

        for (const file of fileArray) {
            // Validate
            const validation = validateFileForUpload(file);
            const id = Math.random().toString(36).substring(7);

            if (!validation.valid) {
                // handle error
            }

            // Create preview
            let preview: string | undefined;
            if (file.type.startsWith('image/')) {
                preview = URL.createObjectURL(file);
            }

            uploadedFiles.push({
                file,
                id,
                preview,
                progress: 0,
                status: 'pending',
            });
        }
        setFiles(prev => [...prev, ...uploadedFiles].slice(0, maxFiles));
    }, [maxFiles]);

    const uploadAll = async () => {
        if (!selectedProjectId) return;

        const pendingFiles = files.filter(f => f.status === 'pending');

        await Promise.all(pendingFiles.map(async (fileData) => {
            updateFileStatus(fileData.id, 'uploading', 0);

            try {
                const fileType = fileData.file.type.startsWith('image/') ? 'image' :
                    fileData.file.type.startsWith('video/') ? 'video' : 'document';

                await uploadFile(fileData.file, selectedProjectId, fileType);
                updateFileStatus(fileData.id, 'success', 100);
            } catch (error) {
                updateFileStatus(fileData.id, 'error', 0, 'Upload fallito');
            }
        }));

        if (onUploadComplete) onUploadComplete();
    };

    const removeFile = (id: string) => {
        setFiles(prev => {
            const file = prev.find(f => f.id === id);
            if (file?.preview) URL.revokeObjectURL(file.preview);
            return prev.filter(f => f.id !== id);
        });
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    }, [addFiles]);

    const getFileIcon = (file: File) => {
        if (file.type.startsWith('image/')) return <Image className="w-5 h-5" />;
        if (file.type.startsWith('video/')) return <Video className="w-5 h-5" />;
        return <FileText className="w-5 h-5" />;
    };

    const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || 'Seleziona Cantiere';

    return (
        <div className="space-y-6">
            {/* Project Selector */}
            <div className="relative z-20">
                <label className="block text-xs font-bold text-luxury-gold uppercase tracking-widest mb-2 ml-1">
                    Destinazione
                </label>
                <div className="relative">
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={cn(
                            "w-full flex items-center justify-between px-4 py-3 bg-luxury-bg/50 border rounded-xl transition-all",
                            isDropdownOpen ? "border-luxury-gold ring-1 ring-luxury-gold/50" : "border-luxury-gold/20 hover:border-luxury-gold/40",
                            !selectedProjectId && "text-luxury-text/50 italic"
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <FolderKanban className="w-4 h-4 text-luxury-gold" />
                            <span className={cn("text-sm font-medium", selectedProjectId && "text-luxury-text")}>
                                {selectedProjectName}
                            </span>
                        </div>
                    </button>

                    <AnimatePresence>
                        {isDropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-luxury-bg border border-luxury-gold/20 rounded-xl shadow-2xl z-50 custom-scrollbar"
                            >
                                {projects.map(project => (
                                    <button
                                        key={project.id}
                                        onClick={() => {
                                            setSelectedProjectId(project.id);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-luxury-text hover:bg-luxury-gold/10 transition-colors flex items-center gap-2 group"
                                    >
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            selectedProjectId === project.id ? "bg-luxury-gold" : "bg-luxury-gold/20 group-hover:bg-luxury-gold/50"
                                        )} />
                                        {project.name}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Drop Zone */}
            <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                className={cn(
                    "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300",
                    isDragging ? "border-luxury-gold bg-luxury-gold/5 scale-[1.02]" : "border-luxury-gold/20 bg-white/5 hover:border-luxury-gold/40"
                )}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,video/*"
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                    className="hidden"
                />
                <Upload className="w-10 h-10 mx-auto mb-3 text-luxury-gold" />
                <p className="text-luxury-text font-medium text-sm">Trascina i file o clicca</p>
            </div>

            {/* File List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {files.map(file => (
                    <div key={file.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="w-10 h-10 rounded-lg bg-black/20 flex items-center justify-center shrink-0">
                            {file.preview ? (
                                <img src={file.preview} className="w-full h-full object-cover rounded-lg" />
                            ) : getFileIcon(file.file)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-luxury-text truncate">{file.file.name}</p>

                            {file.status === 'uploading' && (
                                <div className="mt-1 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "100%" }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="h-full bg-luxury-gold"
                                    />
                                </div>
                            )}
                            {file.status === 'success' && <p className="text-[10px] text-green-400">Completato</p>}
                        </div>
                        <button onClick={() => removeFile(file.id)} className="p-1 hover:bg-white/10 rounded text-luxury-text/50">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Action Button */}
            <button
                onClick={uploadAll}
                disabled={!selectedProjectId || files.length === 0}
                className="w-full py-4 bg-luxury-gold text-luxury-bg font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-luxury-gold/20 flex items-center justify-center gap-2"
            >
                {files.some(f => f.status === 'uploading') ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Caricamento in corso...
                    </>
                ) : (
                    <>
                        <Upload className="w-5 h-5" />
                        Avvia Upload
                    </>
                )}
            </button>
        </div>
    );
}
