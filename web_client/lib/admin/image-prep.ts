import imageCompression from 'browser-image-compression';

/** Above this a photo is shrunk in the browser first (also keeps requests small on every proxy in between). */
export const DIRECT_UPLOAD_LIMIT = 3 * 1024 * 1024;

/**
 * The file to send: small ones as they are, big ones scaled down to ~3 MB / 2560 px. The server
 * re-checks and re-encodes whatever arrives; if shrinking fails the original is sent and judged there.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= DIRECT_UPLOAD_LIMIT) return file;
  try {
    return await imageCompression(file, { maxSizeMB: 3, maxWidthOrHeight: 2560, useWebWorker: true });
  } catch (error) {
    console.warn('[prepareImageForUpload] could not shrink the image, sending the original', error);
    return file;
  }
}
