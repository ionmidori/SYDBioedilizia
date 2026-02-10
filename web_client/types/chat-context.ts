import { UIMessage as Message } from 'ai'; // Vercel AI SDK Type
import { FormEvent, ChangeEvent } from 'react';

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
     * The ID of the currently active project.
     * - `null` means "Global / Landing Page" context.
     * - `string` means specific "Project" context.
     */
    currentProjectId: string | null;

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
     * Current input value in the chat box.
     */
    input: string;

    /**
     * Error state from the AI SDK or Network.
     */
    error: Error | undefined;

    // Actions
    /**
     * Switch context to a specific project or back to global (null).
     */
    setProjectId: (id: string | null) => void;

    /**
     * Handle input change from the Textarea/Input.
     */
    handleInputChange: (e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>) => void;

    /**
     * Submit a message to the AI.
     * Wraps Vercel SDK's `append` to ensure `projectId` is injected into the request body.
     */
    submitMessage: (e?: FormEvent) => Promise<void>;

    /**
     * Send a message with optional attachments and metadata.
     * Flexible alternative to submitMessage.
     */
    sendMessage: (content: string, attachments?: any[], data?: any) => Promise<void>;

    /**
     * Reload the last message (retry).
     * Mapped to `regenerate` in SDK v3.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any[];
}
