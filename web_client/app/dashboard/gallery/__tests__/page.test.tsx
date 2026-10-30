import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GalleryPage from '../page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
let mockUserChatId: string | null = 'chat-1';
let mockError: Error | undefined;
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({ userChatId: mockUserChatId, error: mockError, reload: jest.fn() }),
}));
jest.mock('@/components/house/HouseMediaView', () => ({
    HouseMediaView: ({ chatId }: { chatId: string }) => <div>media of {chatId}</div>,
}));
jest.mock('@/components/ui/ScallopedPageTransition', () => ({ ScallopedInlineLoader: () => <div data-testid="loader" /> }));

beforeEach(() => {
    mockUserChatId = 'chat-1';
    mockError = undefined;
});

describe('/dashboard/gallery — the media of the house (Phase 139)', () => {
    it('shows every file of the user’s house', () => {
        render(<GalleryPage />);

        expect(screen.getByRole('heading', { level: 1, name: 'Galleria' })).toBeInTheDocument();
        expect(screen.getByText('media of chat-1')).toBeInTheDocument();
    });

    it('says so when the user’s chat cannot be had, instead of waiting forever', () => {
        mockUserChatId = null;
        mockError = new Error('Non riusciamo ad aprire la tua chat. Riprova.');
        render(<GalleryPage />);

        expect(screen.getByRole('alert')).toHaveTextContent('Non riusciamo ad aprire la tua chat');
        expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });
});
