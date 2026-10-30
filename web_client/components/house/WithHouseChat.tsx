'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChatAlert } from '@/components/chat/ChatAlert';
import { ScallopedInlineLoader } from '@/components/ui/ScallopedPageTransition';
import { useChatContext } from '@/hooks/useChatContext';
import { mapErrorToMessage } from '@/lib/chat/error-messages';

/**
 * Renders `children` with the id of the user's one chat (Phase 139): a loader
 * until the backend names it, an error with a retry if it cannot.
 */
export function WithHouseChat({ children }: { children: (chatId: string) => ReactNode }) {
    const router = useRouter();
    const { userChatId, error, reload } = useChatContext();

    if (userChatId !== null) return <>{children(userChatId)}</>;

    if (error) {
        return (
            <div className="p-4">
                <ChatAlert
                    variant="error"
                    message={mapErrorToMessage(error.message).message}
                    onDismiss={() => router.push('/')}
                    dismissLabel="Torna al sito"
                    action={{ label: 'Riprova', ariaLabel: 'Riprova', onClick: () => void reload() }}
                />
            </div>
        );
    }

    return <ScallopedInlineLoader />;
}
