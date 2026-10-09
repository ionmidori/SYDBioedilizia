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
