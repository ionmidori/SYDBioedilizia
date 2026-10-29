/**
 * Phase 139 PR-0b: a magic link brings the user back to the page the link was
 * asked from, with the chat as it was — not always to the home page with the
 * chat closed. The page comes from the link, so only paths of this site.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerifyPage from '../page';
import { setChatWindowOpen, takeReopenChat } from '@/lib/chat/chat-window-state';

const mockReplace = jest.fn();
const mockPush = jest.fn();
// The same router on every render, as Next.js gives it.
const mockRouter = { replace: mockReplace, push: mockPush };
jest.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
}));

const mockCompleteMagicLink = jest.fn();
let mockUseAuthValue: { completeMagicLink: jest.Mock } = { completeMagicLink: mockCompleteMagicLink };
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => mockUseAuthValue,
}));

jest.mock('@/utils/haptics', () => ({ triggerHaptic: jest.fn() }));

function openLink(query: string) {
    window.history.replaceState(null, '', `/auth/verify?mode=signIn&oobCode=c1&apiKey=k&${query}`);
}

async function verifyAndWait() {
    render(<VerifyPage />);
    expect(await screen.findByText('Accesso effettuato!')).toBeInTheDocument();
    await act(async () => {
        jest.advanceTimersByTime(2000);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('emailForSignIn', 'u@test.com');
    setChatWindowOpen(false);
    mockCompleteMagicLink.mockResolvedValue(undefined);
    mockUseAuthValue = { completeMagicLink: mockCompleteMagicLink };
});

afterEach(() => {
    jest.useRealTimers();
    window.history.replaceState(null, '', '/');
});

it('goes back to the page the link was asked from, with the chat open', async () => {
    openLink(`next=${encodeURIComponent('/faq?projectId=p1')}&chat=open`);

    await verifyAndWait();

    expect(mockCompleteMagicLink).toHaveBeenCalledWith(window.location.href, 'u@test.com');
    expect(mockReplace).toHaveBeenCalledWith('/faq?projectId=p1');
    expect(mockPush).not.toHaveBeenCalled();
    expect(takeReopenChat()).toBe(true);
});

it('leaves the chat closed when it was closed', async () => {
    openLink(`next=${encodeURIComponent('/faq')}`);

    await verifyAndWait();

    expect(mockReplace).toHaveBeenCalledWith('/faq');
    expect(takeReopenChat()).toBe(false);
});

it('never leaves the site, whatever the link says', async () => {
    openLink(`next=${encodeURIComponent('https://evil.example/phish')}&chat=open`);

    await verifyAndWait();

    expect(mockReplace).toHaveBeenCalledWith('/');
});

it('goes home from an old link without a page', async () => {
    openLink('');

    await verifyAndWait();

    expect(mockReplace).toHaveBeenCalledWith('/');
});

it('uses the link once, though the signed-in user renders the page again', async () => {
    // AuthProvider gives a new completeMagicLink after the login: a second
    // attempt failed with auth/invalid-action-code and showed the error.
    openLink(`next=${encodeURIComponent('/faq')}&chat=open`);
    const view = render(<VerifyPage />);
    expect(await screen.findByText('Accesso effettuato!')).toBeInTheDocument();

    mockUseAuthValue = { completeMagicLink: jest.fn().mockRejectedValue({ code: 'auth/invalid-action-code' }) };
    view.rerender(<VerifyPage />);
    await act(async () => {
        jest.advanceTimersByTime(2000);
    });

    expect(mockUseAuthValue.completeMagicLink).not.toHaveBeenCalled();
    expect(mockCompleteMagicLink).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Errore')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/faq');
});

it('stays on the error when the link is not valid', async () => {
    mockCompleteMagicLink.mockRejectedValue(new Error('Invalid email link'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    openLink(`next=${encodeURIComponent('/faq')}&chat=open`);

    render(<VerifyPage />);

    expect(await screen.findByText('Il link non è valido o è scaduto.')).toBeInTheDocument();
    await act(async () => {
        jest.advanceTimersByTime(2000);
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(takeReopenChat()).toBe(false);
});
