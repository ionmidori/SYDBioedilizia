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

    // Handle File Selection with Immediate Upload to Storage
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            setIsUploading(true);
            setUploadStatus('Preparazione...');

            // ℹ️ INFO: Inform user if file is large (will be compressed automatically)
            const maxFileSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxFileSize) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                console.log(`[Image Upload] Large file detected: ${sizeMB}MB - Will compress automatically`);
                setUploadStatus(`Compressione (${sizeMB}MB)...`);
            }

            try {
                // Step 1: Compress image (automatically handles large files)
                const compressed = await compressImageForGemini(file);
                const originalKB = (file.size / 1024).toFixed(0);
                const compressedKB = (compressed.size / 1024).toFixed(0);
                console.log(`[Image Upload] Compressed: ${originalKB}KB → ${compressedKB}KB`);

                // Step 2: Convert to base64
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(compressed);
                });

                // Step 3: Upload to Firebase Storage (if sessionId available)
                let publicUrl = '';

                if (sessionId) {
                    setUploadStatus('Caricamento...');
                    console.log('[Image Upload] Uploading to Storage for persistent URL...');

                    try {
                        const uploadResponse = await fetch('/api/upload-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                image: base64,
                                sessionId: sessionId,
                            }),
                        });

                        if (!uploadResponse.ok) {
                            throw new Error(`Upload failed: ${uploadResponse.status}`);
                        }

                        const uploadResult = await uploadResponse.json();

                        if (uploadResult.success && uploadResult.url) {
                            publicUrl = uploadResult.url;
                            console.log('[Image Upload] ✅ Public URL:', publicUrl);
                        } else {
                            console.error('[Image Upload] Upload failed:', uploadResult.error);
                        }
                    } catch (uploadErr) {
                        console.error('[Image Upload] Storage upload error:', uploadErr);
                        console.warn('[Image Upload] Continuing without public URL (modification mode will not work)');
                    }
                } else {
                    console.warn('[Image Upload] No sessionId provided - skipping Storage upload');
                }

                // Step 4: Save to state
                setSelectedImages(prev => [...prev, base64]); // For preview
                if (publicUrl) {
                    setImageUrls(prev => [...prev, publicUrl]); // For AI modification mode
                }

                setUploadStatus('Pronto!');
                // Clear status after delay
                setTimeout(() => setUploadStatus(''), 2000);

            } catch (err) {
                console.error('[Image Upload] Error:', err);
                alert('⚠️ Errore durante il caricamento dell\'immagine. Prova con un file più piccolo.');
                setUploadStatus('Errore');
                // Reset input
                e.target.value = '';
            } finally {
                setIsUploading(false);
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
