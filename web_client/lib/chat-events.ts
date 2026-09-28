/**
 * Window events that open the chat widget from anywhere on the page. The widget
 * listens through `hooks/useOpenChatEvents.ts`; callers use `openChat()` rather
 * than dispatching by hand, so the event names live only here.
 */
export const CHAT_EVENTS = {
    open: 'OPEN_CHAT',
    openWithMessage: 'OPEN_CHAT_WITH_MESSAGE',
} as const;

export interface OpenChatDetail {
    message?: string;
}

declare global {
    interface WindowEventMap {
        [CHAT_EVENTS.open]: Event;
        [CHAT_EVENTS.openWithMessage]: CustomEvent<OpenChatDetail>;
    }
}

/** Opens the chat widget; with a `message`, also pre-fills its input. */
export function openChat(message?: string): void {
    window.dispatchEvent(
        message === undefined
            ? new Event(CHAT_EVENTS.open)
            : new CustomEvent<OpenChatDetail>(CHAT_EVENTS.openWithMessage, { detail: { message } }),
    );
}
