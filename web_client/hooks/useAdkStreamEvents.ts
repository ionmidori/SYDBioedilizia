import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

export interface StreamData {
    type: string;
    payload?: unknown;
    [key: string]: unknown;
}

interface UseAdkStreamEventsReturn {
    /**
     * Accumulated ADK custom-data events for the current session, exposed on
     * the chat context as `data`.
     */
    streamData: StreamData[];
    /** Pass straight to `useChat({ onData })`. */
    onData: (dataPart: unknown) => void;
}

/**
 * Accumulate the ADK custom-data stream and re-broadcast it as DOM events.
 *
 * AI SDK v7 delivers transient `data-*` parts through the `onData` callback
 * (`useChat().data` no longer exists), so they are accumulated here. Widgets
 * and gallery panels listen for the dispatched CustomEvents instead of
 * subscribing to the chat context, which keeps them decoupled from the
 * provider.
 */
export function useAdkStreamEvents(sessionId: string): UseAdkStreamEventsReturn {
    // ADK custom-data stream (status / interrupt / ui_widget / artifact / reasoning).
    const [streamData, setStreamData] = useState<StreamData[]>([]);
    // How many entries of streamData have already been broadcast. The SDK can
    // append several parts within one React batch, so the effect below must
    // resume from a cursor rather than look at the tail.
    const dispatchedCountRef = useRef(0);

    const onData = useCallback((dataPart: unknown) => {
        // The backend wraps the legacy event object (which carries its own `type`)
        // in `dataPart.data`, so unwrap it to keep downstream consumers unchanged.
        if (!dataPart || typeof dataPart !== 'object') return;
        const inner = (dataPart as { data?: unknown }).data;
        if (inner && typeof inner === 'object') {
            setStreamData((prev) => [...prev, inner as StreamData]);
        }
    }, []);

    // Drop the previous session's ADK data events when sessionId changes.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional per-session reset: drop the previous session's ADK data events when sessionId changes
        setStreamData([]);
        dispatchedCountRef.current = 0;
    }, [sessionId]);

    useEffect(() => {
        if (streamData.length <= dispatchedCountRef.current) return;

        // Walk every event appended since the last run: React batches the
        // setStreamData calls, so a single commit can carry more than one.
        for (let i = dispatchedCountRef.current; i < streamData.length; i++) {
            const data = streamData[i];
            if (!data) continue;

            if (data.type === 'interrupt') {
                logger.debug('[ChatProvider] ADK Interrupt Received:', data);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adk-interrupt', { detail: data.payload }));
                }
            }

            // ADK 1.27+ UiWidget: backend tool called tool_context.render_ui_widget()
            // Dispatch event so chat components can render native widget components
            // without relying only on the tool name string.
            if (data.type === 'ui_widget') {
                logger.debug('[ChatProvider] ADK UiWidget Received:', data);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adk-ui-widget', { detail: data }));
                }
            }

            // ADK 1.27+ Artifact: backend tool called tool_context.save_artifact()
            // Dispatch event so gallery/media panels can refresh to show the new artifact.
            if (data.type === 'artifact') {
                logger.debug('[ChatProvider] ADK Artifact Saved:', data);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adk-artifact', { detail: data }));
                }
            }
        }
        dispatchedCountRef.current = streamData.length;
    }, [streamData]);

    return { streamData, onData };
}
