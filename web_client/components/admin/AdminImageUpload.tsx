"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { useAuth } from '@/hooks/useAuth';
import { Upload, X, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Types mirroring the backend SignedUrl schemas
interface SignedUrlRequest {
  filename: string;
  content_type: string;
  folder?: string;
}

interface SignedUrlResponse {
  upload_url: string;
  public_url: string;
  path: string;
}

interface AdminImageUploadProps {
  onUploadSuccess: (url: string) => void;
  folder?: string;
}

export function AdminImageUpload({ onUploadSuccess, folder = 'admin_assets' }: AdminImageUploadProps) {
  const { idToken, refreshToken } = useAuth();
  
  const [file, setFile] = useState<File | null>(null);
  const [previewSize, setPreviewSize] = useState<number>(0);
  const [compressedSize, setCompressedSize] = useState<number>(0);
  
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Compression options adhering to the 'compressing-media' skill
  const compressionOptions = {
    maxSizeMB: 1, 
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/webp'
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    setSuccess(false);
    setProgress(0);
    
    if (acceptedFiles.length === 0) return;
    
    const originalFile = acceptedFiles[0];
    setFile(originalFile);
    setPreviewSize(originalFile.size);
    
    try {
      setUploading(true);
      setProgress(10); // Start compression phase
      
      const compressedFile = await imageCompression(originalFile, compressionOptions);
      setCompressedSize(compressedFile.size);
      setProgress(30); // Compression done
      
      // Get valid Firebase Auth ID Token for our backend API call
      const token = idToken || await refreshToken();
      if (!token) throw new Error("Authentication required");
      
      const safeFilename = compressedFile.name.replace(/\.[^/.]+$/, "") + ".webp";
      const signedUrlReq: SignedUrlRequest = {
        filename: safeFilename,
        content_type: "image/webp",
        folder
      };

      // 1. Ask Python Backend for a Signed URL
      const apiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";
      const res = await fetch(`${apiUrl}/api/v1/admin/storage/signed-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(signedUrlReq)
      });
      
      if (!res.ok) {
        throw new Error(`Failed to get upload URL: ${res.statusText}`);
      }
      
      const { upload_url, public_url } = await res.json() as SignedUrlResponse;
      setProgress(50); // URL received
      
      // 2. Direct-to-Cloud Upload
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "image/webp"
        },
        body: compressedFile
      });
      
      if (!uploadRes.ok) {
        throw new Error("Cloud Storage upload failed");
      }
      
      setProgress(100);
      setSuccess(true);
      onUploadSuccess(public_url); // Pass the public URL back to the parent component
      
    } catch (err: any) {
      console.error("[AdminImageUpload]", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }, [idToken, refreshToken, folder, onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1,
    disabled: uploading || success
  });

  return (
    <div className="w-full max-w-lg mx-auto">
      <div 
        {...getRootProps()} 
        className={`
          relative overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center cursor-pointer
          transition-colors duration-300 flex flex-col items-center justify-center min-h-[240px] shadow-sm
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'}
          ${uploading || success ? 'pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <AnimatePresence mode="wait">
          {!uploading && !success && !error && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="p-4 rounded-full bg-secondary-container text-on-secondary-container">
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-title-medium text-on-surface font-medium">Click to upload or drag and drop</p>
                <p className="text-body-medium text-on-surface-variant">SVG, PNG, JPG or GIF (max. 10MB)</p>
              </div>
            </motion.div>
          )}

          {uploading && (
            <motion.div 
              key="uploading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center gap-5 w-full"
            >
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <div className="w-full max-w-xs space-y-3">
                <div className="flex justify-between text-label-large text-on-surface-variant font-medium">
                  <span>{progress <= 30 ? 'Compressing Image...' : 'Uploading to Cloud...'}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-surface-variant rounded-full h-2 overflow-hidden shadow-inner">
                  <motion.div 
                    className="bg-primary h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "easeInOut", duration: 0.3 }}
                  />
                </div>
                {compressedSize > 0 && (
                  <p className="text-body-small text-on-surface-variant text-center opacity-80 mt-2">
                    Optimized: {(previewSize / 1024 / 1024).toFixed(2)}MB → {(compressedSize / 1024 / 1024).toFixed(2)}MB
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {success && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex flex-col items-center gap-4 py-2"
            >
              <div className="p-4 rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <p className="text-title-medium text-on-surface font-medium">Upload Complete!</p>
                <p className="text-body-small text-on-surface-variant">Your image was successfully uploaded.</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setSuccess(false); setFile(null); }}
                className="text-primary text-label-large hover:underline mt-2 p-2"
              >
                Upload another file
              </button>
            </motion.div>
          )}

          {error && (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 px-4"
            >
              <div className="p-3 rounded-full bg-error-container text-on-error-container">
                <X className="w-6 h-6" />
              </div>
              <p className="text-title-small text-error font-medium">Upload Failed</p>
              <p className="text-body-medium text-on-surface-variant max-w-[250px]">{error}</p>
              <button 
                onClick={(e) => { e.stopPropagation(); setError(null); setFile(null); }}
                className="text-on-surface bg-surface-variant text-label-large mt-3 rounded-full px-5 py-2 hover:bg-surface-variant/80 transition-colors"
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
