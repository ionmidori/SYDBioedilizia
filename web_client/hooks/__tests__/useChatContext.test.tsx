import type { ChatContextType } from '@/types/chat-context';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { ChatContext, useChatContext } from '../useChatContext';

describe('useChatContext', () => {
    it('throws a descriptive error outside of ChatProvider', () => {
        // renderHook surfaces the throw; silence React's error boundary noise
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => renderHook(() => useChatContext())).toThrow(
            'useChatContext must be used within a ChatProvider'
        );
        errorSpy.mockRestore();
    });

    it('returns the provided context value', () => {
        const value = { input: 'ciao' } as unknown as ChatContextType;
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
        );

        const { result } = renderHook(() => useChatContext(), { wrapper });

        expect(result.current).toBe(value);
    });
});
