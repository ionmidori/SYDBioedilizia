import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';

// Mock fetch
global.fetch = jest.fn();

// Mock TextDecoder
class MockTextDecoder {
    decode(value: Uint8Array, options?: { stream?: boolean }) {
        return new TextDecoder().decode(value);
    }
}

global.TextDecoder = MockTextDecoder as any;

describe('useChat', () => {
    const mockSessionId = 'test-session-123';
    const mockInitialMessages = [
        { id: '1', role: 'assistant', content: 'Hello!' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should initialize with provided messages', () => {
        const { result } = renderHook(() => useChat(mockSessionId, mockInitialMessages));

        expect(result.current.messages).toEqual(mockInitialMessages);
        expect(result.current.isLoading).toBe(false);
    });

    it('should initialize with empty messages if not provided', () => {
        const { result } = renderHook(() => useChat(mockSessionId));

        expect(result.current.messages).toEqual([]);
    });

    it('should provide append and setMessages functions', () => {
        const { result } = renderHook(() => useChat(mockSessionId));

        expect(typeof result.current.append).toBe('function');
        expect(typeof result.current.setMessages).toBe('function');
    });

    it('should add user message optimistically when append is called', async () => {
        // Mock successful response
        const mockReader = {
            read: jest.fn()
                .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Hello') })
                .mockResolvedValueOnce({ done: true, value: undefined }),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: {
                getReader: () => mockReader,
            },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Test message' });
        });

        expect(result.current.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'user',
                    content: 'Test message',
                }),
            ])
        );
    });

    it('should set isLoading to true during fetch', async () => {
        const mockReader = {
            read: jest.fn().mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ done: true }), 100))
            ),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        act(() => {
            result.current.append({ role: 'user', content: 'Test' });
        });

        // Check that loading is true during fetch
        await waitFor(() => {
            expect(result.current.isLoading).toBe(true);
        });
    });

    it('should handle streaming text response', async () => {
        const mockReader = {
            read: jest.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('Hello ')
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('world!')
                })
                .mockResolvedValueOnce({ done: true }),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Hi' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // Should have accumulated the streamed content
        const assistantMessage = result.current.messages.find(m => m.role === 'assistant');
        expect(assistantMessage?.content).toBe('Hello world!');
    });

    it('should parse JSON chunks with image URLs', async () => {
        const jsonChunk = JSON.stringify({
            imageUrl: 'https://example.com/image.png',
            description: 'Test image',
        });

        const mockReader = {
            read: jest.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode(jsonChunk)
                })
                .mockResolvedValueOnce({ done: true }),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Generate image' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        const assistantMessage = result.current.messages.find(m => m.role === 'assistant');
        expect(assistantMessage?.content).toContain('![Test image](https://example.com/image.png)');
    });

    it('should parse JSON chunks with text content', async () => {
        const jsonChunk = JSON.stringify({
            text: 'Extracted text from JSON',
        });

        const mockReader = {
            read: jest.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode(jsonChunk)
                })
                .mockResolvedValueOnce({ done: true }),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Test' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        const assistantMessage = result.current.messages.find(m => m.role === 'assistant');
        expect(assistantMessage?.content).toBe('Extracted text from JSON');
    });

    it('should skip data-only JSON chunks', async () => {
        const jsonChunk = JSON.stringify({
            action: 'internal',
            params: { key: 'value' },
        });

        const mockReader = {
            read: jest.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode(jsonChunk)
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('Regular text')
                })
                .mockResolvedValueOnce({ done: true }),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Test' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        const assistantMessage = result.current.messages.find(m => m.role === 'assistant');
        // Should only contain the regular text, not the JSON data
        expect(assistantMessage?.content).toBe('Regular text');
    });

    it('should handle fetch errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server error' }),
        });

        // Mock alert
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Test' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(alertSpy).toHaveBeenCalledWith('Errore di connessione. Riprova.');
        alertSpy.mockRestore();
    });

    it('should include images in request body when provided', async () => {
        const mockImages = ['data:image/png;base64,test'];

        const mockReader = {
            read: jest.fn().mockResolvedValue({ done: true }),
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: { getReader: () => mockReader },
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append(
                { role: 'user', content: 'Test with image' },
                { body: { images: mockImages } }
            );
        });

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/chat',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: expect.stringContaining('images'),
            })
        );
    });

    it('should handle network errors', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failed'));

        const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Test' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(alertSpy).toHaveBeenCalled();
        alertSpy.mockRestore();
    });

    it('should handle null response body', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            body: null,
        });

        const { result } = renderHook(() => useChat(mockSessionId, []));

        await act(async () => {
            await result.current.append({ role: 'user', content: 'Test' });
        });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // Should handle gracefully without crashing
        expect(result.current.messages).toBeDefined();
    });
});
