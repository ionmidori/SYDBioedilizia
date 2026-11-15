import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { HouseDashboard } from '../HouseDashboard';
import { openChat } from '@/lib/chat-events';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockView: string | null = null;
jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
    useSearchParams: () => ({ get: (key: string) => (key === 'view' ? mockView : null) }),
}));
jest.mock('@/lib/chat-events', () => ({ openChat: jest.fn() }));

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
    it('renders the uniform workspace without inline chat, shows Media by default, and keeps other panels mounted with hidden', () => {
        render(<HouseDashboard />);

        expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'La tua casa' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Media' })).toHaveTextContent('media of chat-1');
        expect(screen.getByText('quote of chat-1').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
        expect(screen.getByText('quote of chat-1').closest('[role="tabpanel"]')).toHaveAttribute('aria-labelledby', 'house-tab-quote');
        expect(screen.getByText('details of chat-1').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
        expect(screen.getByText('details of chat-1').closest('[role="tabpanel"]')).toHaveAttribute('aria-labelledby', 'house-tab-house');
        expect(screen.getByText('quote of chat-1')).not.toBeVisible();
        expect(screen.getByText('details of chat-1')).not.toBeVisible();
    });

    it('opens the tab ?view= names, and keeps the others mounted', () => {
        mockView = 'quote';
        render(<HouseDashboard />);

        expect(screen.getByRole('tab', { name: 'Preventivo' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Preventivo' })).toHaveTextContent('quote of chat-1');
        expect(screen.getByText('media of chat-1')).not.toBeVisible();
        expect(screen.getByText('details of chat-1')).not.toBeVisible();
    });

    it('switches tab through the address, so a reload lands on the same tab', async () => {
        render(<HouseDashboard />);

        await userEvent.click(screen.getByRole('tab', { name: 'Casa' }));

        expect(mockReplace).toHaveBeenCalledWith('/dashboard?view=house', { scroll: false });
    });

    it('supports keyboard ArrowRight/ArrowLeft/Home/End navigation across house tabs', async () => {
        render(<HouseDashboard />);

        const mediaTab = screen.getByRole('tab', { name: 'Media' });
        mediaTab.focus();
        await userEvent.keyboard('{ArrowRight}');
        expect(mockReplace).toHaveBeenLastCalledWith('/dashboard?view=quote', { scroll: false });
        expect(screen.getByRole('tab', { name: 'Preventivo' })).toHaveFocus();

        await userEvent.keyboard('{ArrowLeft}');
        expect(mockReplace).toHaveBeenLastCalledWith('/dashboard?view=media', { scroll: false });
        expect(mediaTab).toHaveFocus();

        await userEvent.keyboard('{End}');
        expect(mockReplace).toHaveBeenLastCalledWith('/dashboard?view=house', { scroll: false });
        expect(screen.getByRole('tab', { name: 'Casa' })).toHaveFocus();

        await userEvent.keyboard('{Home}');
        expect(mockReplace).toHaveBeenLastCalledWith('/dashboard?view=media', { scroll: false });
        expect(mediaTab).toHaveFocus();
    });

    it('opens the floating chat when clicking Chiedi a SYD', async () => {
        render(<HouseDashboard />);

        await userEvent.click(screen.getByRole('button', { name: 'Chiedi a SYD' }));

        expect(openChat).toHaveBeenCalledTimes(1);
        expect(openChat).toHaveBeenCalledWith();
    });

    it('rescues legacy ?view=chat by falling back to Media and calling openChat() once per ?view=chat entry', () => {
        mockView = 'chat';
        const { rerender } = render(<HouseDashboard />);

        expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel', { name: 'Media' })).toHaveTextContent('media of chat-1');
        expect(openChat).toHaveBeenCalledTimes(1);

        // Unrelated rerenders while staying on ?view=chat must not spam openChat().
        rerender(<HouseDashboard />);
        expect(openChat).toHaveBeenCalledTimes(1);

        // Switching to another view resets the guard so returning to ?view=chat rescues again once.
        mockView = 'quote';
        rerender(<HouseDashboard />);
        expect(openChat).toHaveBeenCalledTimes(1);

        mockView = 'chat';
        rerender(<HouseDashboard />);
        expect(openChat).toHaveBeenCalledTimes(2);
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
