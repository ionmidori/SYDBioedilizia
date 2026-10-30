'use client';

import { Suspense, useEffect } from 'react';
import ChatWidget from '@/components/chat/ChatWidget';
import ProjectInfoCard from '@/components/dashboard/ProjectInfoCard';
import { useParams, useRouter } from 'next/navigation';
import { useChatContext } from '@/hooks/useChatContext';
import { ChatAlert } from '@/components/chat/ChatAlert';
import { mapErrorToMessage } from '@/lib/chat/error-messages';
import { cn } from '@/lib/utils';
import { ProjectMobileTabs } from '@/components/mobile/ProjectMobileTabs';
import { ScallopedInlineLoader } from '@/components/ui/ScallopedPageTransition';
import { useProject } from '@/hooks/use-project';

export default function ProjectPage() {
    const params = useParams();
    const projectId = params.id as string;

    return <ProjectPageContent projectId={projectId} />;
}

function ProjectPageContent({ projectId }: { projectId: string }) {
    const router = useRouter();
    const { userChatId, error, reload } = useChatContext();
    const { data: project, isLoading } = useProject(projectId);

    // One chat per user (Phase 139): the page only shows the user's chat; any
    // other id goes back to the dashboard.
    const isOtherChat = userChatId !== null && projectId !== userChatId;
    useEffect(() => {
        if (isOtherChat) router.replace('/dashboard');
    }, [isOtherChat, router]);

    // The user's chat could not be had: say so, with a retry, instead of a loader.
    if (userChatId === null && error) {
        return (
            <div className="p-4">
                <ChatAlert
                    variant="error"
                    message={mapErrorToMessage(error.message).message}
                    onDismiss={() => router.push('/dashboard')}
                    dismissLabel="Torna alla dashboard"
                    action={{ label: 'Riprova', ariaLabel: 'Riprova', onClick: () => void reload() }}
                />
            </div>
        );
    }

    if (isLoading || userChatId === null || isOtherChat) {
        return (
            <ScallopedInlineLoader />
        );
    }

    if (!project) return null; // Or 404 state

    return (
        <>
            {/* Mobile View: Swipeable Tabs */}
            {/* Using a concrete height calculation to prevent flex-collapse on iOS Safari.
                100dvh minus DashboardHeader (3.5rem/56px) and env safe area. */}
            <div className="md:hidden h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] w-full">
                <ProjectMobileTabs projectId={projectId} />
            </div>

            {/* Desktop View: Split Screen (full-height, non-scrolling layout) */}
            <div className="hidden md:flex flex-col w-full relative overflow-hidden bg-luxury-bg" style={{ height: 'calc(100dvh - 3.5rem)' }}>
                <div className="flex-1 w-full min-h-0 relative grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
                    {/* Main Chat Area */}
                    <main className="relative flex flex-col min-h-0 bg-black/20 overflow-hidden">
                        <Suspense fallback={<div className="flex-1 bg-luxury-bg animate-pulse" />}>
                            <ChatWidget variant="inline" />
                        </Suspense>
                    </main>

                    {/* Project Info Sidebar */}
                    <aside className={cn(
                        "relative flex flex-col min-h-0 border-l border-luxury-gold/10 bg-luxury-bg/50 backdrop-blur-xl transition-all duration-300",
                        "translate-x-0"
                    )}>
                        <ProjectInfoCard project={project} />
                    </aside>
                </div>
            </div>
        </>
    );
}
