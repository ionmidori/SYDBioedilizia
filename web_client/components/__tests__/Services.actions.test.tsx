import { fireEvent, render, screen } from '@testing-library/react';
import { Services } from '@/components/sections/Services';
import { services } from '@/lib/services-data';
import { CHAT_EVENTS } from '@/lib/chat-events';

const push = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

let mockUser: { isAnonymous: boolean } | null = null;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/components/auth/AuthDialog', () => ({
    AuthDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="login" /> : null),
}));

// Every title is reworded: the click must still follow `action`, never the text.
jest.mock('@/lib/services-data', () => {
    const actual = jest.requireActual('@/lib/services-data');
    return {
        ...actual,
        services: actual.services.map((s: { title: string }) => ({ ...s, title: `${s.title} (nuova)` })),
    };
});

/** Both the mobile stack and the desktop grid render each card as a button. */
const mobileCard = (id: string) => {
    const service = services.find((s) => s.id === id);
    if (!service) throw new Error(`no service ${id}`);
    return screen.getAllByRole('button', { name: new RegExp(service.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })[0];
};

describe('Services — click actions', () => {
    beforeEach(() => {
        push.mockClear();
        mockUser = null;
    });

    it('declares an action for every card', () => {
        services.forEach((s) => expect(['dashboard', 'chat']).toContain(s.action));
    });

    it('asks a guest to log in from the dashboard card, even with a reworded title', () => {
        const dashboard = services.find((s) => s.action === 'dashboard');
        render(<Services />);

        fireEvent.click(mobileCard(dashboard!.id));

        expect(screen.getByRole('dialog', { name: 'login' })).toBeInTheDocument();
        expect(push).not.toHaveBeenCalled();
    });

    it('takes a signed-in user straight to the dashboard', () => {
        mockUser = { isAnonymous: false };
        const dashboard = services.find((s) => s.action === 'dashboard');
        render(<Services />);

        fireEvent.click(mobileCard(dashboard!.id));

        expect(push).toHaveBeenCalledWith('/dashboard');
    });

    it('opens the chat from every chat card', () => {
        const onOpen = jest.fn();
        window.addEventListener(CHAT_EVENTS.open, onOpen);
        render(<Services />);

        const chatCards = services.filter((s) => s.action === 'chat');
        chatCards.forEach((s) => fireEvent.click(mobileCard(s.id)));

        expect(onOpen).toHaveBeenCalledTimes(chatCards.length);
        expect(push).not.toHaveBeenCalled();
        window.removeEventListener(CHAT_EVENTS.open, onOpen);
    });

    it('activates desktop service cards via Enter or Space keyboard events', () => {
        const onOpen = jest.fn();
        window.addEventListener(CHAT_EVENTS.open, onOpen);
        render(<Services />);

        const chatService = services.find((s) => s.action === 'chat')!;
        const desktopCard = screen.getAllByRole('button', {
            name: new RegExp(chatService.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        })[1];

        fireEvent.keyDown(desktopCard, { key: 'Enter' });
        fireEvent.keyDown(desktopCard, { key: ' ' });

        expect(onOpen).toHaveBeenCalledTimes(2);
        window.removeEventListener(CHAT_EVENTS.open, onOpen);
    });
});
