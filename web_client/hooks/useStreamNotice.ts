import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A `data-notice` from the backend: something the user should know about the
 * turn that is not an error — the reply still arrives (e.g. an attached video
 * that could not be read and was ignored).
 */
export interface StreamNotice {
    level: 'info' | 'warning';
    code: string;
    message: string;
}

export function isStreamNotice(entry: unknown): entry is StreamNotice & { type: 'notice' } {
    if (!entry || typeof entry !== 'object') return false;
    const { type, message, code } = entry as Record<string, unknown>;
    return type === 'notice' && typeof message === 'string' && typeof code === 'string';
}

/**
 * The latest notice in the ADK stream data, until dismissed.
 *
 * Reads every entry added since the last render (a cursor, not just the tail):
 * the backend sends the notice right before status updates and React can batch
 * them into one commit. Entries present at mount are skipped (the data lives in
 * the root ChatProvider, so a widget mounted on another page would replay an
 * old notice). When the data shrinks (new session) it starts over.
 */
export function useStreamNotice(data: readonly unknown[]): { notice: StreamNotice | null; dismiss: () => void } {
    const [notice, setNotice] = useState<StreamNotice | null>(null);
    const readRef = useRef(data.length);

    useEffect(() => {
        if (data.length < readRef.current) readRef.current = 0;
        const fresh = data.slice(readRef.current);
        readRef.current = data.length;

        const latest = [...fresh].reverse().find(isStreamNotice);
        if (latest) {
            setNotice({ level: latest.level === 'info' ? 'info' : 'warning', code: latest.code, message: latest.message });
        }
    }, [data]);

    const dismiss = useCallback(() => setNotice(null), []);
    return { notice, dismiss };
}
