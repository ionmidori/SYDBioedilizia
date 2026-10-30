import { renderHook, waitFor } from '@testing-library/react';
import { useChatMoveRecovery, type SentTurn } from '../useChatMoveRecovery';

/** The AI SDK's error for a non-2xx answer of /api/chat (APICallError shape). */
function httpError(statusCode: number, errorCode: string): Error {
    const body = JSON.stringify({ error_code: errorCode, message: 'Ricarica la pagina per continuare.' });
    return Object.assign(new Error(body), { name: 'AI_APICallError', statusCode, responseBody: body });
}

const TURN: SentTurn = {
    content: 'Rifacciamo il bagno',
    attachments: ['https://cdn/foto.jpg'],
    data: { mediaUrls: ['https://cdn/foto.jpg'], roomId: 'r_bagno_old' },
};

interface Props {
    error: Error | undefined;
    sessionId: string | null;
    historyReady: boolean;
    enabled: boolean;
}

function setup(initial: Partial<Props> = {}, newChatId: string | null = 'new-chat') {
    const refreshUserChat = jest.fn(() => Promise.resolve(newChatId));
    const resend = jest.fn();
    const lastTurn = jest.fn(() => TURN);
    const props: Props = { error: undefined, sessionId: 'old-chat', historyReady: true, enabled: true, ...initial };
    const hook = renderHook(
        (p: Props) => useChatMoveRecovery({ ...p, refreshUserChat, resend, lastTurn }),
        { initialProps: props },
    );
    return { ...hook, props, refreshUserChat, resend };
}

describe('useChatMoveRecovery', () => {
    it('hides the refusal, moves to the user’s chat and sends the turn there once', async () => {
        const moved = httpError(409, 'CHAT_MERGED');
        const { result, rerender, props, refreshUserChat, resend } = setup();

        rerender({ ...props, error: moved });
        expect(result.current.visibleError).toBeUndefined();
        await waitFor(() => expect(refreshUserChat).toHaveBeenCalledTimes(1));

        // The new chat opens: a new useChat, its history loads, then the turn goes.
        rerender({ ...props, error: undefined, sessionId: 'new-chat', historyReady: false });
        expect(resend).not.toHaveBeenCalled();
        rerender({ ...props, error: undefined, sessionId: 'new-chat', historyReady: true });

        expect(resend).toHaveBeenCalledTimes(1);
        // The room belonged to the old chat: the new chat's active room is used.
        expect(resend).toHaveBeenCalledWith({
            content: TURN.content,
            attachments: TURN.attachments,
            data: { mediaUrls: ['https://cdn/foto.jpg'] },
        });

        rerender({ ...props, error: undefined, sessionId: 'new-chat', historyReady: true });
        expect(resend).toHaveBeenCalledTimes(1);
    });

    it('recovers from a stale id too (USER_CHAT_MISMATCH)', async () => {
        const { result, rerender, props, refreshUserChat } = setup();

        rerender({ ...props, error: httpError(409, 'USER_CHAT_MISMATCH') });

        expect(result.current.visibleError).toBeUndefined();
        await waitFor(() => expect(refreshUserChat).toHaveBeenCalled());
    });

    it('shows the refusal when the backend gives the same chat again, without a loop', async () => {
        const moved = httpError(409, 'CHAT_MERGED');
        const { result, rerender, props, refreshUserChat, resend } = setup({}, 'old-chat');

        rerender({ ...props, error: moved });

        await waitFor(() => expect(result.current.visibleError).toBe(moved));
        rerender({ ...props, error: moved });
        expect(refreshUserChat).toHaveBeenCalledTimes(1);
        expect(resend).not.toHaveBeenCalled();
    });

    it('shows the refusal when the user chat cannot be had', async () => {
        const moved = httpError(409, 'CHAT_MERGED');
        const { result, rerender, props, refreshUserChat } = setup();
        refreshUserChat.mockRejectedValueOnce(new Error('offline'));

        rerender({ ...props, error: moved });

        await waitFor(() => expect(result.current.visibleError).toBe(moved));
    });

    it('leaves a guest’s refusal as it is: a guest has no user chat to move to', () => {
        const moved = httpError(409, 'CHAT_MERGED');
        const { result, rerender, props, refreshUserChat } = setup({ enabled: false });

        rerender({ ...props, enabled: false, error: moved });

        expect(result.current.visibleError).toBe(moved);
        expect(refreshUserChat).not.toHaveBeenCalled();
    });

    it('leaves any other error as it is', () => {
        const other = httpError(503, 'BACKEND_ERROR');
        const { result, rerender, props, refreshUserChat } = setup();

        rerender({ ...props, error: other });

        expect(result.current.visibleError).toBe(other);
        expect(refreshUserChat).not.toHaveBeenCalled();
    });
});
