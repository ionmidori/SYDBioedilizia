/**
 * TypeScript interface mirroring Storage schemas from backend_python/src/schemas/storage.py
 * Maintained under the "Golden Sync" rule.
 */

export interface SignedUrlRequest {
  filename: string;
  content_type: string;
  folder?: string;
}

export interface SignedUrlResponse {
  upload_url: string;
  public_url: string;
  path: string;
}
