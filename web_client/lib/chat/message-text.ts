/**
 * Visible text of a chat message.
 *
 * With token streaming, output guardrails (Model Armor, leak filter) check the
 * reply after part of it has been shown. When they replace it, the backend
 * sends a `data-redact` part (fixed id, updated in place by the AI SDK) whose
 * `data.text` is the safe text for the whole message: it wins over the
 * streamed text parts ("stream-then-verify").
 */
type PartLike = { type: string; text?: unknown; data?: unknown };

const PLACEHOLDER = '...';

export function getVisibleText(parts: readonly PartLike[] | undefined): string {
    if (!parts) return '';
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.type === 'data-redact') {
            const text = (part.data as { text?: unknown } | undefined)?.text;
            if (typeof text === 'string') return text;
        }
    }
    const text = parts
        .filter(part => part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text as string)
        .join('');
    // Legacy "zero-latency" placeholder chunk: not real content.
    return text.startsWith(PLACEHOLDER) ? text.slice(PLACEHOLDER.length) : text;
}

/** True once the assistant message has real text to show. */
export function hasVisibleText(parts: readonly PartLike[] | undefined): boolean {
    return getVisibleText(parts).trim().length > 0;
}

/** Storage object of a URL (origin + path): the query of a signed URL changes per request. */
function imageKey(url: string): string | null {
    try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
    } catch {
        return null;
    }
}

/**
 * Removes markdown images that show a file the tools already display (e.g. the
 * render shown by ToolStatus). The model often repeated `![…](imageUrl)` in its
 * reply, so the user saw the same render twice.
 */
export function stripDuplicateImages(text: string, toolImageUrls: readonly string[]): string {
    const keys = new Set(toolImageUrls.map(imageKey).filter((k): k is string => k !== null));
    if (keys.size === 0) return text;
    return text
        .replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, (match, url: string) => {
            const key = imageKey(url);
            return key && keys.has(key) ? '' : match;
        })
        .replace(/\n{3,}/g, '\n\n');
}
