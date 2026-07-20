import { useCallback, useEffect, useState } from 'react';
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

    const onData = useCallback((dataPart: unknown) => {
        // The backend wraps the legacy event object (which carries its own `type`)
        // in `dataPart.data`, so unwrap it to keep downstream consumers unchanged.
        const inner = (dataPart as { data?: unknown }).data;
        if (inner && typeof inner === 'object') {
            setStreamData((prev) => [...prev, inner as StreamData]);
        }
    }, []);

    // Drop the previous session's ADK data events when sessionId changes.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional per-session reset: drop the previous session's ADK data events when sessionId changes
        setStreamData([]);
    }, [sessionId]);

    useEffect(() => {
        const currentData = streamData;
        if (currentData.length === 0) return;

        const latestData = currentData[currentData.length - 1];
        if (!latestData) return;

        if (latestData.type === 'interrupt') {
            logger.debug('[ChatProvider] ADK Interrupt Received:', latestData);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adk-interrupt', { detail: latestData.payload }));
            }
        }

        // ADK 1.27+ UiWidget: backend tool called tool_context.render_ui_widget()
        // Dispatch event so chat components can render native widget components
        // without relying only on the tool name string.
        if (latestData.type === 'ui_widget') {
            logger.debug('[ChatProvider] ADK UiWidget Received:', latestData);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adk-ui-widget', { detail: latestData }));
            }
        }

        // ADK 1.27+ Artifact: backend tool called tool_context.save_artifact()
        // Dispatch event so gallery/media panels can refresh to show the new artifact.
        if (latestData.type === 'artifact') {
            logger.debug('[ChatProvider] ADK Artifact Saved:', latestData);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('adk-artifact', { detail: latestData }));
            }
        }
    }, [streamData]);

    return { streamData, onData };
}
