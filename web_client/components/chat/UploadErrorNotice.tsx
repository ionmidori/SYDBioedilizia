"use client";

/**
 * UploadErrorNotice - why the attachments above failed.
 *
 * The thumbnails are 64-96px wide: a 90-character reason ("... Riprova domani
 * dopo le 09:10.") would be clipped, and the retry time is the part the user
 * needs. So thumbnails only say "Non riuscito" and the full reason is shown
 * here, once per distinct message.
 */
import type { UploadItem } from '@/types/media';

interface UploadErrorNoticeProps {
    items: UploadItem[];
}

export function UploadErrorNotice({ items }: UploadErrorNoticeProps) {
    const reasons = Array.from(
        new Set(items.filter((i) => i.status === 'error' && i.error).map((i) => i.error as string))
    );
    if (reasons.length === 0) return null;

    return (
        <div role="alert" data-testid="upload-errors" className="px-1 text-xs leading-snug text-red-300">
            <ul className="space-y-0.5">
                {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                ))}
            </ul>
        </div>
    );
}
