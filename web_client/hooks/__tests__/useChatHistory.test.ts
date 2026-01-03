import { renderHook, waitFor } from '@testing-library/react';
import { useChatHistory } from '../useChatHistory';

// Mock fetch
global.fetch = jest.fn();

describe('useChatHistory', () => {
    const mockSessionId = 'test-session-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should initialize with empty history and historyLoaded as false', () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ messages: [] }),
        });

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        expect(result.current.historyLoaded).toBe(false);
        expect(result.current.historyMessages).toEqual([]);
    });

    it('should fetch history on mount', async () => {
        const mockMessages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ messages: mockMessages }),
        });

        renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                `/api/chat/history?sessionId=${mockSessionId}`
            );
        });
    });

    it('should set historyLoaded to true after successful fetch', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ messages: [] }),
        });

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
        });
    });

    it('should handle successful history load with messages', async () => {
        const mockMessages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ messages: mockMessages }),
        });

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            expect(result.current.historyMessages).toHaveLength(2);
            expect(result.current.historyMessages[0]).toMatchObject({
                id: expect.stringContaining('history-'),
                role: 'user',
                content: 'Hello',
            });
        });
    });

    it('should handle empty history response', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ messages: [] }),
        });

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
            expect(result.current.historyMessages).toEqual([]);
        });
    });

    it('should handle fetch errors gracefully', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
        });

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
            expect(result.current.historyMessages).toEqual([]);
        });
    });

    it('should handle network errors gracefully', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            expect(result.current.historyLoaded).toBe(true);
            expect(result.current.historyMessages).toEqual([]);
        });
    });

    it('should map API response to correct message format', async () => {
        const mockMessages = [
            { role: 'user', content: 'Test message', extraField: 'ignored' },
        ];

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ messages: mockMessages }),
        });

        const { result } = renderHook(() => useChatHistory(mockSessionId));

        await waitFor(() => {
            const message = result.current.historyMessages[0];
            expect(message).toHaveProperty('id');
            expect(message).toHaveProperty('role', 'user');
            expect(message).toHaveProperty('content', 'Test message');
        });
    });
});
