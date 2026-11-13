import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageItem } from '../MessageItem';
import { renderWithCompany } from '@/test-utils/company';
import type { Message } from '@/types/chat';

// --- Mocks ---
let mockUser: { isAnonymous: boolean } | null = null;
// The url transform the last rendered Markdown block received (react-markdown is mocked below).
let lastUrlTransform: ((url: string) => string) | undefined;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser }),
}));

// The card reads the chat context (pending message): a probe is enough here.
jest.mock('@/components/chat/tools/LoginRequest', () => ({
    LoginRequest: () => <div data-testid="login-card" />,
}));


// Render ToolStatus as a thin probe so we can assert MessageItem passes the
// resolved tool (with imageUrl) down to it.
jest.mock('../ToolStatus', () => ({
    isRenderError: jest.requireActual('../ToolStatus').isRenderError,
    ToolStatus: ({ tool }: { tool: { result?: { imageUrl?: string } } }) => (
        <div data-testid="tool-status">{tool.result?.imageUrl ?? 'no-image'}</div>
    ),
}));

// ESM-only module not transformed by Jest — render children as plain text.
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children, remarkPlugins, urlTransform }: { children?: React.ReactNode; remarkPlugins?: unknown[]; urlTransform?: (url: string) => string }) => {
        lastUrlTransform = urlTransform;
        return <div data-testid="markdown" data-plugins={remarkPlugins?.length ?? 0}>{children}</div>;
    },
}));

// Heavy / Firebase-touching children — stub them out.
jest.mock('@/components/chat/ImagePreview', () => ({ ImagePreview: () => <div /> }));
jest.mock('@/components/chat/MessageFeedback', () => ({ MessageFeedback: () => <div /> }));
jest.mock('@/components/ArchitectAvatar', () => ({ __esModule: true, default: () => <div /> }));
// The card reads and writes by itself (ConfirmationCard.test.tsx): a probe is enough here.
jest.mock('@/components/confirmations/ConfirmationCard', () => ({
    ConfirmationCard: ({ projectId }: { projectId: string }) => <div data-testid="confirmation-card">{projectId}</div>,
}));

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

describe('MessageItem — login card', () => {
    // Production, 28 Oct: the router called request_login twice, then the quote
    // agent once more — three calls in one assistant message, three cards.
    const loginCall = (n: number) => ({
        toolCallId: `login-${n}`,
        toolName: 'request_login',
        state: 'result',
        args: {},
        result: 'LOGIN_REQUIRED_TRIGGERED',
    });
    const loginReply = {
        id: 'm3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Per il preventivo serve un account gratuito.' }],
        toolInvocations: [loginCall(1), loginCall(2), loginCall(3)],
    } as unknown as Message;

    afterEach(() => {
        mockUser = null;
    });

    it('shows one card for a guest, however many times the agents asked for the login', () => {
        mockUser = { isAnonymous: true };
        render(<MessageItem message={loginReply} sessionId="s1" onImageClick={jest.fn()} />);

        expect(screen.getAllByTestId('login-card')).toHaveLength(1);
    });

    it('shows no card, and the reply text, once the user has signed in', () => {
        mockUser = { isAnonymous: false };
        const { container } = render(
            <MessageItem message={loginReply} sessionId="s1" onImageClick={jest.fn()} />
        );

        expect(screen.queryByTestId('login-card')).not.toBeInTheDocument();
        expect(container).toHaveTextContent('Per il preventivo serve un account gratuito.');
    });
});

describe('MessageItem — confirmation card (Phase 140)', () => {
    const reply = { id: 'm4', role: 'assistant', parts: [{ type: 'text', text: 'Conferma le misure nella scheda qui sotto.' }] } as unknown as Message;

    afterEach(() => {
        mockUser = null;
    });

    it('draws the card under the reply for a signed-in client, on the project of the chat', () => {
        mockUser = { isAnonymous: false };
        render(<MessageItem message={reply} sessionId="s1" onImageClick={jest.fn()} showConfirmations />);

        expect(screen.getByTestId('confirmation-card')).toHaveTextContent('s1');
    });

    it.each([
        ['a guest', { isAnonymous: true }],
        ['nobody signed in', null],
    ])('draws no card for %s: the project id of a guest is an access token', (_label, user) => {
        mockUser = user;
        render(<MessageItem message={reply} sessionId="s1" onImageClick={jest.fn()} showConfirmations />);

        expect(screen.queryByTestId('confirmation-card')).not.toBeInTheDocument();
    });

    it('draws no card when the chat did not ask for it', () => {
        mockUser = { isAnonymous: false };
        render(<MessageItem message={reply} sessionId="s1" onImageClick={jest.fn()} />);

        expect(screen.queryByTestId('confirmation-card')).not.toBeInTheDocument();
    });

    it('draws no card without a project', () => {
        mockUser = { isAnonymous: false };
        render(<MessageItem message={reply} onImageClick={jest.fn()} showConfirmations />);

        expect(screen.queryByTestId('confirmation-card')).not.toBeInTheDocument();
    });
});

describe('MessageItem — tool errors', () => {
    it('draws no bubble for an assistant step whose only tool was refused (not a render)', () => {
        const message = {
            id: 'm4',
            role: 'assistant',
            parts: [{ type: 'text', text: '' }],
            toolInvocations: [{
                toolCallId: 'room-1', toolName: 'select_room', state: 'result', args: {},
                result: { status: 'error', message: 'Le stanze sono disponibili solo agli utenti registrati.' },
            }],
        } as unknown as Message;

        const { container } = render(<MessageItem message={message} sessionId="s1" onImageClick={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});

describe('MessageItem — company contacts (Phase 141)', () => {
    const say = (role: 'assistant' | 'user', text: string) =>
        ({ id: 'c1', role, parts: [{ type: 'text', text }] }) as unknown as Message;
    const onImage = () => {};

    it('links the contacts of an assistant reply and offers the contact actions', () => {
        renderWithCompany(<MessageItem message={say('assistant', 'Chiamaci al +39 06 1234567')} sessionId="s1" onImageClick={onImage} />);
        expect(screen.getByTestId('markdown')).toHaveAttribute('data-plugins', '1');
        expect(screen.getByRole('link', { name: 'Chiama' })).toHaveAttribute('href', 'tel:+39061234567');
        expect(screen.getByRole('link', { name: 'Salva il contatto di SYD' })).toBeInTheDocument();
    });

    it('offers no actions under a reply that does not write a contact', () => {
        renderWithCompany(<MessageItem message={say('assistant', 'Il bagno costa € 3.755,46')} sessionId="s1" onImageClick={onImage} />);
        expect(screen.queryByRole('link', { name: 'Chiama' })).not.toBeInTheDocument();
    });

    it('leaves what the user writes alone, even a phone number', () => {
        renderWithCompany(<MessageItem message={say('user', 'Il mio numero è +39 06 1234567')} sessionId="s1" onImageClick={onImage} />);
        expect(screen.getByTestId('markdown')).toHaveAttribute('data-plugins', '0');
        expect(screen.queryByRole('link', { name: 'Chiama' })).not.toBeInTheDocument();
    });

    // Final review: the model must not be able to write a working `tel:` link to any number.
    it('lets through a tel: link to the company phone only', () => {
        renderWithCompany(<MessageItem message={say('assistant', 'Chiamaci al +39 06 1234567')} sessionId="s1" onImageClick={onImage} />);
        expect(lastUrlTransform?.('tel:+39061234567')).toBe('tel:+39061234567');
        expect(lastUrlTransform?.('tel:+39899123456')).toBe('');
        expect(lastUrlTransform?.('javascript:alert(1)')).toBe('');
        expect(lastUrlTransform?.('https://esempio.it')).toBe('https://esempio.it');
    });

    it('lets through no tel: link at all in what the user writes', () => {
        renderWithCompany(<MessageItem message={say('user', 'Il mio numero è +39 06 1234567')} sessionId="s1" onImageClick={onImage} />);
        expect(lastUrlTransform?.('tel:+39061234567')).toBe('');
    });

    it('still renders the reply without company info', () => {
        renderWithCompany(<MessageItem message={say('assistant', 'Chiamaci al +39 06 1234567')} sessionId="s1" onImageClick={onImage} />, null);
        expect(screen.getByText('Chiamaci al +39 06 1234567')).toBeInTheDocument();
        expect(screen.getByTestId('markdown')).toHaveAttribute('data-plugins', '0');
    });
});

describe('MessageItem — welcome quick actions', () => {
    const welcomeMessage = {
        id: 'welcome-msg',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Ciao! Come posso aiutarti oggi?' }],
    } as unknown as Message;

    it('renders simplified quote/render cards and the company info card, forwarding exact prompts on click', () => {
        const onQuickPrompt = jest.fn();
        renderWithCompany(
            <MessageItem
                message={welcomeMessage}
                sessionId="s1"
                onImageClick={jest.fn()}
                onQuickPrompt={onQuickPrompt}
            />,
        );

        const quoteButton = screen.getByRole('button', { name: 'Voglio fare un preventivo' });
        const renderButton = screen.getByRole('button', { name: 'Voglio fare un rendering' });
        const materialsButton = screen.getByRole('button', { name: /Materiali e design/i });
        const companyButton = screen.getByRole('button', { name: /Informazioni generali sulla società/i });

        expect(quoteButton).toHaveTextContent('Voglio fare un preventivo');
        expect(renderButton).toHaveTextContent('Voglio fare un rendering');
        expect(materialsButton).toBeInTheDocument();
        expect(companyButton).toBeInTheDocument();

        fireEvent.click(quoteButton);
        expect(onQuickPrompt).toHaveBeenCalledWith('Voglio fare un preventivo');

        fireEvent.click(renderButton);
        expect(onQuickPrompt).toHaveBeenCalledWith('Voglio fare un rendering');

        fireEvent.click(companyButton);
        expect(onQuickPrompt).toHaveBeenCalledWith(
            'Vorrei informazioni generali sulla società (chi siete, cosa fate, zone servite e come contattarvi)',
        );
    });

    it('does not render quick action cards when onQuickPrompt is omitted', () => {
        renderWithCompany(
            <MessageItem message={welcomeMessage} sessionId="s1" onImageClick={jest.fn()} />,
        );
        expect(screen.queryByRole('group', { name: 'Azioni rapide' })).not.toBeInTheDocument();
    });
});
