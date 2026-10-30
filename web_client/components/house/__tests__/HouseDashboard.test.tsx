import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { HouseDashboard } from '../HouseDashboard';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockView: string | null = null;
jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
    useSearchParams: () => ({ get: (key: string) => (key === 'view' ? mockView : null) }),
}));

let mockUserChatId: string | null = 'chat-1';
let mockError: Error | undefined;
const mockReload = jest.fn();
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({ userChatId: mockUserChatId, error: mockError, reload: mockReload }),
}));
jest.mock('@/components/chat/ChatWidget', () => ({ __esModule: true, default: () => <div data-testid="chat" /> }));
jest.mock('../HouseMediaView', () => ({ HouseMediaView: ({ chatId }: { chatId: string }) => <div>media of {chatId}</div> }));
jest.mock('../HouseQuotePanel', () => ({ HouseQuotePanel: ({ chatId }: { chatId: string }) => <div>quote of {chatId}</div> }));
jest.mock('../HouseSettingsView', () => ({ HouseSettingsView: ({ chatId }: { chatId: string }) => <div>details of {chatId}</div> }));
jest.mock('@/components/ui/ScallopedPageTransition', () => ({ ScallopedInlineLoader: () => <div data-testid="loader" /> }));

beforeEach(() => {
    jest.clearAllMocks();
    mockView = null;
    mockUserChatId = 'chat-1';
    mockError = undefined;
});

describe('HouseDashboard — the dashboard is the house (Phase 139)', () => {
    it('shows the chat of the house once, beside the panel of its media', () => {
        render(<HouseDashboard />);

        expect(screen.getAllByTestId('chat')).toHaveLength(1);
        expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Media' })).toHaveTextContent('media of chat-1');
        expect(screen.getByText('quote of chat-1')).not.toBeVisible();
    });

    it('opens the tab ?view= names, and keeps the others mounted', () => {
        mockView = 'quote';
        render(<HouseDashboard />);

        expect(screen.getByRole('tabpanel', { name: 'Preventivo' })).toHaveTextContent('quote of chat-1');
        expect(screen.getByText('media of chat-1')).not.toBeVisible();
        expect(screen.getByText('details of chat-1')).not.toBeVisible();
    });

    it('switches tab through the address, so a reload lands on the same tab', async () => {
        render(<HouseDashboard />);

        await userEvent.click(screen.getByRole('tab', { name: 'Casa' }));

        expect(mockReplace).toHaveBeenCalledWith('/dashboard?view=house', { scroll: false });
    });

    it('on a phone, shows either the chat or the tab ?view= names', () => {
        mockView = 'chat';
        const { rerender } = render(<HouseDashboard />);
        expect(screen.getByTestId('chat-column')).not.toHaveClass('hidden');
        expect(screen.getByTestId('panel-column')).toHaveClass('hidden');

        mockView = 'media';
        rerender(<HouseDashboard />);
        expect(screen.getByTestId('chat-column')).toHaveClass('hidden');
        expect(screen.getByTestId('panel-column')).not.toHaveClass('hidden');
    });

    it('waits for the user’s chat', () => {
        mockUserChatId = null;
        render(<HouseDashboard />);

        expect(screen.getByTestId('loader')).toBeInTheDocument();
        expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    });

    it('says so, with a retry, when the user’s chat cannot be had', async () => {
        mockUserChatId = null;
        mockError = new Error('Non riusciamo ad aprire la tua chat. Riprova.');
        render(<HouseDashboard />);

        expect(screen.getByRole('alert')).toHaveTextContent('Non riusciamo ad aprire la tua chat');
        await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
        expect(mockReload).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });
});
