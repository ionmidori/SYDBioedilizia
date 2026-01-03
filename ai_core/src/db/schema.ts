import { Timestamp } from 'firebase-admin/firestore';

/**
 * Firestore Schema Definitions
 * Collections: users, sessions, messages (subcollection), leads
 */

// /users/{userId}
export interface User {
    email: string;
    displayName: string;
    photoURL?: string;
    createdAt: Timestamp;
    plan: 'free' | 'pro';
    metadata: {
        totalSessions: number;
        totalMessages: number;
        totalImagesGenerated: number;
    };
}

// /sessions/{sessionId}
export interface Session {
    userId?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    summary?: string; // AI-generated summary for old sessions
    messageCount: number;
    status: 'active' | 'archived';
    lastMessagePreview?: string;
}

// /sessions/{sessionId}/messages/{messageId}
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Timestamp;
    tokens?: {
        input: number;
        output: number;
    };
    imageUrl?: string; // For generated images
    toolCalls?: Array<{
        name: string;
        args: any;
        result: any;
    }>;
}

// /leads/{leadId}
export interface Lead {
    sessionId: string;
    userId?: string;
    name: string;
    email: string;
    phone?: string;
    projectDetails: string;
    roomType?: string;
    style?: string;
    estimatedBudget?: string;
    createdAt: Timestamp;
    status: 'new' | 'contacted' | 'converted';
}

// Collection names (constants for type safety)
export const COLLECTIONS = {
    USERS: 'users',
    SESSIONS: 'sessions',
    MESSAGES: 'messages', // subcollection under sessions
    LEADS: 'leads',
} as const;
