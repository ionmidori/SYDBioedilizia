import { UIMessage as Message } from 'ai'; // Vercel AI SDK Type
import { Message as FirestoreMessage } from './chat';
import { FormEvent, ChangeEvent } from 'react';
import type { RoomChip } from '@/hooks/useProjectRooms';

/**
 * Global Chat Context Interface
 * Acts as the Single Source of Truth for the AI Assistant state across the application.
 * 
 * Vercel AI SDK v3 Upgrade Note:
 * - Uses UIMessage instead of Message
 * - reload returns void (mapped to regenerate)
 * - added sendMessage for flexible attachment support
 */
export interface ChatContextType {
    // State
    /**
     * Session key of the active conversation (backend, Firestore history,
     * Storage upload prefix). Guests get a stable per-browser id, signed-in
     * users the chat the backend gives (GET /api/me/chat, Phase 139). `null`
     * until it is known: nothing can be sent until then.
     */
    sessionId: string | null;

    /**
     * The signed-in user's chat — the house: its rooms, files and quote live
     * under this id. `null` for a guest, or while it is being asked for.
     */
    userChatId: string | null;

    /**
     * Flag indicating if we are switching contexts and hyrdating history.
     * Used to show a "Skeleton Loader" instead of an empty chat.
     */
    isRestoringHistory: boolean;

    /**
     * Vercel AI SDK Loading State
     */
    isLoading: boolean;

    /**
     * Current list of messages in the conversation.
     */
    messages: Message[];

    /**
     * Raw history messages from Firestore (preserves custom fields like rating).
     */
    historyMessages: FirestoreMessage[];

    /**
     * Current input value in the chat box.
     */
    input: string;

    /**
     * Error state from the AI SDK or Network.
     */
    error: Error | undefined;

    // Actions
    /**
     * Handle input change from the Textarea/Input.
     */
    handleInputChange: (e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>) => void;

    /**
     * Submit a message to the AI.
     */
    submitMessage: (e?: FormEvent) => Promise<void>;

    /**
     * Send a message with optional attachments and metadata.
     * Flexible alternative to submitMessage.
     */
    sendMessage: (content: string, attachments?: string[], data?: Record<string, unknown>) => Promise<void>;

    /**
     * Retry: the last message (`regenerate`), or asking for the user's chat
     * again when that is what failed.
     */
    reload: () => Promise<void>;

    /**
     * Stop the current generation.
     */
    stop: () => void;

    /**
     * Manually set the input value (e.g. for predefined prompts).
     */
    setInput: (value: string) => void;

    /**
     * Function to force refresh the chat history
     */
    refreshHistory: () => Promise<void>;

    /**
     * Data stream from the AI (used for status updates, protocol v2).
     */
    data?: unknown[];

    /**
     * Rooms of the user's chat (Phase 138), in creation order. Empty for a guest.
     */
    rooms: RoomChip[];

    /**
     * Room the next message and uploads belong to (`null` without rooms).
     * Follows the agent when it picks another room (`select_room`).
     */
    activeRoomId: string | null;

    /**
     * Make a room active (room chip tapped, room just created).
     */
    setActiveRoomId: (roomId: string) => void;
}
