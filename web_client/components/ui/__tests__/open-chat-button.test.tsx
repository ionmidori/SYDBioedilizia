import { fireEvent, render, screen } from '@testing-library/react';
import { OpenChatButton } from '@/components/ui/open-chat-button';
import { openChat } from '@/lib/chat-events';

jest.mock('@/lib/chat-events', () => ({
    openChat: jest.fn(),
}));

describe('OpenChatButton', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('opens the chat without message when prompt is omitted', () => {
        render(<OpenChatButton>Parla con SYD</OpenChatButton>);
        fireEvent.click(screen.getByRole('button', { name: 'Parla con SYD' }));
        expect(openChat).toHaveBeenCalledTimes(1);
        expect(openChat).toHaveBeenCalledWith(undefined);
    });

    it('passes the contextual prompt to openChat and invokes extra onClick handlers', () => {
        const onClick = jest.fn();
        render(
            <OpenChatButton prompt="Vorrei approfondire: Smart Remodel" onClick={onClick}>
                Chiedi a SYD
            </OpenChatButton>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Chiedi a SYD' }));
        expect(openChat).toHaveBeenCalledTimes(1);
        expect(openChat).toHaveBeenCalledWith('Vorrei approfondire: Smart Remodel');
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
