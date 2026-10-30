import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectPage from '../page';

const mockReplace = jest.fn();
let mockRouteId = 'chat-of-u1';
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: mockRouteId }),
    useRouter: () => ({ replace: mockReplace }),
}));

let mockUserChatId: string | null = 'chat-of-u1';
jest.mock('@/hooks/useChatContext', () => ({
    useChatContext: () => ({ userChatId: mockUserChatId }),
}));
jest.mock('@/hooks/use-project', () => ({
    useProject: (id: string) => ({ data: { session_id: id, title: 'Casa' }, isLoading: false }),
}));
jest.mock('@/components/chat/ChatWidget', () => ({
    __esModule: true,
    default: () => <div data-testid="chat" />,
}));
jest.mock('@/components/dashboard/ProjectInfoCard', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('@/components/mobile/ProjectMobileTabs', () => ({ ProjectMobileTabs: () => <div /> }));
jest.mock('@/components/ui/ScallopedPageTransition', () => ({
    ScallopedInlineLoader: () => <div data-testid="loader" />,
}));

beforeEach(() => {
    mockReplace.mockReset();
    mockRouteId = 'chat-of-u1';
    mockUserChatId = 'chat-of-u1';
});

describe('/dashboard/[id] — one chat per user (Phase 139)', () => {
    it('shows the user’s chat', () => {
        render(<ProjectPage />);

        expect(screen.getAllByTestId('chat').length).toBeGreaterThan(0);
        expect(mockReplace).not.toHaveBeenCalled();
    });

    it('sends any other id back to the dashboard', () => {
        mockRouteId = 'another-chat';

        render(<ProjectPage />);

        expect(mockReplace).toHaveBeenCalledWith('/dashboard');
        expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
    });

    it('waits for the user’s chat before deciding', () => {
        mockUserChatId = null;

        render(<ProjectPage />);

        expect(screen.getByTestId('loader')).toBeInTheDocument();
        expect(mockReplace).not.toHaveBeenCalled();
    });
});
