import { fireEvent, render, screen } from '@testing-library/react';
import { Services } from '@/components/sections/Services';
import { services } from '@/lib/services-data';

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

/** The mobile stack renders each card as a button; the desktop grid as an article. */
const mobileCard = (id: string) => {
    const service = services.find((s) => s.id === id);
    if (!service) throw new Error(`no service ${id}`);
    return screen.getByRole('button', { name: new RegExp(service.title.replace(/[()]/g, '\\$&')) });
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
        window.addEventListener('OPEN_CHAT', onOpen);
        render(<Services />);

        const chatCards = services.filter((s) => s.action === 'chat');
        chatCards.forEach((s) => fireEvent.click(mobileCard(s.id)));

        expect(onOpen).toHaveBeenCalledTimes(chatCards.length);
        expect(push).not.toHaveBeenCalled();
        window.removeEventListener('OPEN_CHAT', onOpen);
    });
});
