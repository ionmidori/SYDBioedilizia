import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageItem } from '../MessageItem';
import type { Message } from '@/types/chat';

// --- Mocks ---
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: null }),
}));


// Render ToolStatus as a thin probe so we can assert MessageItem passes the
// resolved tool (with imageUrl) down to it.
jest.mock('../ToolStatus', () => ({
    ToolStatus: ({ tool }: { tool: { result?: { imageUrl?: string } } }) => (
        <div data-testid="tool-status">{tool.result?.imageUrl ?? 'no-image'}</div>
    ),
}));

// ESM-only module not transformed by Jest — render children as plain text.
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Heavy / Firebase-touching children — stub them out.
jest.mock('@/components/chat/ImagePreview', () => ({ ImagePreview: () => <div /> }));
jest.mock('@/components/chat/MessageFeedback', () => ({ MessageFeedback: () => <div /> }));
jest.mock('@/components/ArchitectAvatar', () => ({ __esModule: true, default: () => <div /> }));

const IMAGE_URL = 'https://firebasestorage.googleapis.com/render.png';

describe('MessageItem — render image attachment', () => {
    it('renders the render-tool image when toolInvocations live only in Firestore history (SDK stripped them)', () => {
        // The AI SDK keeps assistant message state WITHOUT toolInvocations
        // (transient tool results are not added to message.parts in v7).
        const sdkMessage = {
            id: 'm1',
            role: 'assistant',
            parts: [{ type: 'text', text: '' }],
        } as unknown as Message;

        // useChatHistory's smart-merge DID build the toolInvocations with the imageUrl.
        const historyMessage =
            {
                id: 'm1',
                role: 'assistant',
                toolInvocations: [
                    {
                        toolCallId: 'c1',
                        toolName: 'generate_render',
                        state: 'result',
                        args: {},
                        result: { imageUrl: IMAGE_URL, status: 'success' },
                    },
                ],
            } as Message;

        render(
            <MessageItem
                message={sdkMessage}
                sessionId="s1"
                onImageClick={jest.fn()}
                historyMessage={historyMessage}
            />
        );

        expect(screen.getByTestId('tool-status')).toHaveTextContent(IMAGE_URL);
    });
});

describe('MessageItem — render shown once', () => {
    it('drops the markdown copy of the render the tool already shows', () => {
        const signed = (sig: string) =>
            `https://storage.googleapis.com/bucket/renders/s1/r.png?X-Goog-Signature=${sig}`;
        const message = {
            id: 'm2',
            role: 'assistant',
            parts: [{ type: 'text', text: `Ecco il rendering!\n\n![Render](${signed('b')})` }],
            toolInvocations: [
                {
                    toolCallId: 'c2',
                    toolName: 'generate_render',
                    state: 'result',
                    args: {},
                    result: { imageUrl: signed('a'), status: 'success' },
                },
            ],
        } as unknown as Message;

        const { container } = render(
            <MessageItem message={message} sessionId="s1" onImageClick={jest.fn()} />
        );

        expect(container).toHaveTextContent('Ecco il rendering!');
        expect(container.textContent).not.toContain('![Render]');
        expect(screen.getByTestId('tool-status')).toHaveTextContent(signed('a'));
    });
});
