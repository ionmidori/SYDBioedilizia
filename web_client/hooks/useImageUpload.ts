import { useState } from 'react';

/**
 * Custom hook for image upload, compression, and preview management
 * 
 * ENHANCED: Now uploads images to Firebase Storage immediately to get public URLs
 * This enables image-to-image modification mode with persistent URLs
 */

interface ImageData {
    preview: string;  // base64 for local preview
    publicUrl: string; // Firebase Storage URL for AI (modification mode)
}

export function useImageUpload(sessionId?: string) {
    // Store both preview (base64) and public URL
    const [selectedImages, setSelectedImages] = useState<string[]>([]); // base64 for backward compatibility
    const [imageUrls, setImageUrls] = useState<string[]>([]); // Public URLs for modification mode
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');

    // Image Compression with Automatic Aggressive Mode for Large Files
    const compressImageForGemini = async (file: File, targetMaxSize?: number): Promise<Blob> => {
        const maxSizeMB = targetMaxSize || 10; // 10MB default
        const maxSizeBytes = maxSizeMB * 1024 * 1024;

        // Initial settings for normal compression
        let maxWidth = 2048;
        let quality = 0.8;
        const mimeType = 'image/jpeg';

        // 🔥 AGGRESSIVE MODE: If file is > maxSize, use more aggressive settings
        if (file.size > maxSizeBytes) {
            console.log(`[Aggressive Compression] File is ${(file.size / 1024 / 1024).toFixed(2)}MB, targeting ${maxSizeMB}MB`);

            // Calculate a rough ratio to determine how aggressive we need to be
            const ratio = file.size / maxSizeBytes;

            if (ratio > 8) { // > 80MB
                maxWidth = 1024;
                quality = 0.5;
            } else if (ratio > 4) { // > 40MB
                maxWidth = 1280;
                quality = 0.6;
            } else if (ratio > 2) { // > 20MB
                maxWidth = 1536;
                quality = 0.7;
            } else { // 10-20MB
                maxWidth = 1800;
                quality = 0.75;
            }

            console.log(`[Aggressive Compression] Using: maxWidth=${maxWidth}px, quality=${quality}`);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');

                // Calculate new dimensions maintaining aspect ratio
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // Verify final size
                            if (blob.size > maxSizeBytes && quality > 0.5) {
                                console.warn('Still too large, retrying with quality 0.5...');
                                // Retry with lower quality if still too big
                                canvas.toBlob((retryBlob) => {
                                    if (retryBlob) resolve(retryBlob);
                                    else reject(new Error('Compression failed'));
                                }, mimeType, 0.5);
                            } else {
                                resolve(blob);
                            }
                        } else {
                            reject(new Error('Compression failed'));
                        }
                    },
                    mimeType,
                    quality
                );
            };

            img.onerror = (error) => reject(error);
            img.src = url;
        });
    };

    // Handle File Selection with Immediate Upload to Storage (Multi-file support)
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            const currentCount = selectedImages.length;
            const maxImages = 2;

            if (currentCount + newFiles.length > maxImages) {
                alert(`Puoi caricare al massimo ${maxImages} immagini.`);
                e.target.value = ''; // Reset input
                return;
            }

            setIsUploading(true);
            setUploadStatus('Preparazione...');

            try {
                // Process all files in parallel
                await Promise.all(newFiles.map(async (file) => {
                    // ℹ️ INFO: Inform user if file is large
                    const maxFileSize = 10 * 1024 * 1024; // 10MB
                    if (file.size > maxFileSize) {
                        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                        console.log(`[Image Upload] Large file detected: ${sizeMB}MB - Will compress automatically`);
                    }

                    // Step 1: Compress image
                    const compressed = await compressImageForGemini(file);

                    // Step 2: Convert to base64
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(compressed);
                    });

                    // Step 3: Upload to Firebase Storage
                    let publicUrl = '';
                    if (sessionId) {
                        try {
                            const uploadResponse = await fetch('/api/upload-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    image: base64,
                                    sessionId: sessionId,
                                }),
                            });

                            if (uploadResponse.ok) {
                                const uploadResult = await uploadResponse.json();
                                if (uploadResult.success && uploadResult.url) {
                                    publicUrl = uploadResult.url;
                                }
                            }
                        } catch (uploadErr) {
                            console.error('[Image Upload] Storage upload error:', uploadErr);
                        }
                    }

                    // Step 4: Update State (Functional updates to avoid race conditions)
                    setSelectedImages(prev => [...prev, base64]);
                    if (publicUrl) {
                        setImageUrls(prev => [...prev, publicUrl]);
                    }
                }));

                setUploadStatus('Pronto!');
                setTimeout(() => setUploadStatus(''), 2000);

            } catch (err) {
                console.error('[Image Upload] Error:', err);
                alert('⚠️ Errore durante il caricamento delle immagini.');
                setUploadStatus('Errore');
            } finally {
                setIsUploading(false);
                // Reset input to allow selecting the same file again if needed
                e.target.value = '';
            }
        }
    };

    // Remove selected image (both preview and URL)
    const removeImage = (index: number) => {
        setSelectedImages((prev) => prev.filter((_, i) => i !== index));
        setImageUrls((prev) => prev.filter((_, i) => i !== index));
    };

    // Clear all images (both previews and URLs)
    const clearImages = () => {
        setSelectedImages([]);
        setImageUrls([]);
    };

    return {
        selectedImages,    // base64 for preview (backward compatible)
        imageUrls,         // Public Storage URLs for modification mode
        isUploading,
        uploadStatus,
        handleFileSelect,
        removeImage,
        clearImages
    };
}
