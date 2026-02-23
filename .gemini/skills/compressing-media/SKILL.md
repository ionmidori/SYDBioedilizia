---
name: compressing-media
description: Implement client-side image and video compression to optimize storage costs and upload speed. Use when handling file uploads in React/Next.js applications.
---

# Compressing Media

This skill provides patterns for compressing images and videos in the browser before they are uploaded to storage (e.g., Firebase, S3). This reduces infrastructure costs and improves performance for mobile users with limited bandwidth.

## 1. Image Compression (Recommended)

Use `browser-image-compression` for a lightweight, stable, and multi-threaded solution.

### Basic Implementation

```typescript
import imageCompression from 'browser-image-compression';

const options = {
  maxSizeMB: 1,          // Target size in MB
  maxWidthOrHeight: 1920, // Max resolution
  useWebWorker: true,    // Offload to separate thread (non-blocking)
  fileType: 'image/webp' // Target format for better efficiency
};

async function compressImage(file: File): Promise<File> {
  try {
    const compressedFile = await imageCompression(file, options);
    console.log(`Size reduced from ${file.size / 1024 / 1024} MB to ${compressedFile.size / 1024 / 1024} MB`);
    return compressedFile;
  } catch (error) {
    console.error('Compression failed', error);
    return file; // Fallback to original
  }
}
```

## 2. Video Optimization

Video compression in the browser is heavy (requires `ffmpeg.wasm`). For mobile-first web apps, prefer strict size/duration validation or hardware-accelerated processing via the `VideoEncoder` API.

### Hardware-Accelerated Pattern (Modern Browsers)

```typescript
// Pattern for checking if the environment supports hardware encoding
async function isVideoEncodingSupported() {
  if (!('VideoEncoder' in window)) return false;
  
  const config = {
    codec: 'avc1.42E01E', // H.264
    width: 1280,
    height: 720,
    bitrate: 2_000_000, // 2 Mbps
  };

  const { supported } = await VideoEncoder.isConfigSupported(config);
  return supported;
}
```

## 3. Implementation Workflow

1.  **Dependency**: Install `browser-image-compression`.
2.  **Hook Integration**: Wrap the compression logic in a reusable utility or hook.
3.  **UI Feedback**: Show a "Compressing..." state in the progress bar to manage user expectations.
4.  **Memory Management**: Always use `URL.revokeObjectURL()` for intermediate previews.

## 4. Best Practices

- **Target WebP**: Converting JPEG/PNG to WebP during compression often yields 30% better results at the same quality.
- **Worker Support**: Always enable `useWebWorker: true` to prevent the UI from freezing during the compression of large photos.
- **Fail Gracefully**: If compression fails or is unsupported, proceed with the original file but alert the system/admin.
