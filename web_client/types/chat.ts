/**
 * Chat types for SYD Renovation
 * Fully compatible with Vercel AI SDK Data Protocol
 */
import type { ReasoningStep } from './reasoning';

export interface ToolInvocation {
    toolCallId: string;
    toolName: string;
    state: 'call' | 'result';
    args: any;
    result?: any;
}

export interface Attachment {
    id: string;
    file: File;
    previewUrl: string;
    type: 'image' | 'video' | 'document'; // Added document support
    status: 'idle' | 'uploading' | 'compressing' | 'done' | 'error';
    progress: number;
    publicUrl?: string; // Firebase URL
    trimRange?: {
        start: number;
        end: number;
    };
    fileUri?: string; // File API URI (for videos)
}

/**
 * AI Reasoning Metadata
 * Canonical type imported from types/reasoning.ts (Golden Sync with backend_python/src/models/reasoning.py).
 * Do NOT redefine this struct here — import it instead.
 */
export type { ReasoningStep };


export interface Message {
    id: string;
    role: 'system' | 'user' | 'assistant' | 'data' | 'tool';
    content?: string;
    reasoning?: string | ReasoningStep; // Support both raw string and structured CoT
    createdAt?: Date;
    timestamp?: string; // ISO timestamp from backend
    tool_call_id?: string; // For tool result messages
    toolInvocations?: ToolInvocation[];
    /**
     * Vercel AI SDK Data Protocol Parts (Text/Image/Tool/Reasoning)
     */
    parts?: any[];
    attachments?: {
        images?: string[];
        videos?: string[];
        documents?: string[]; // Added document support
    };
}

/**
 * UI State Types
 */
export interface ChatButtonPosition {
    x: number;
    y: number;
}

export interface DragConstraints {
    top: number;
    left: number;
    right: number;
    bottom: number;
}

export interface UseDraggableButtonReturn {
    position: ChatButtonPosition;
    constraints: DragConstraints;
    isDragging: boolean;
    handleDragStart: () => void;
    handleDragEnd: (event: any, info: any) => void;
}
