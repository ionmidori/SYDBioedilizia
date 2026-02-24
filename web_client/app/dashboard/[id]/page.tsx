'use client';

import { Suspense, useEffect } from 'react';
import ChatWidget from '@/components/chat/ChatWidget';
import ProjectInfoCard from '@/components/dashboard/ProjectInfoCard';
import { useParams } from 'next/navigation';
import { useChatContext } from '@/hooks/useChatContext';
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
    const { setProjectId } = useChatContext();
    const { data: project, isLoading } = useProject(projectId);

    useEffect(() => {
        if (projectId) {
            setProjectId(projectId);
        }
    }, [projectId, setProjectId]);

    if (isLoading) {
        return (
            <ScallopedInlineLoader />
        );
    }

    if (!project) return null; // Or 404 state

    return (
        <>
            {/* Mobile View: Swipeable Tabs */}
            <div className="md:hidden h-full w-full">
                <ProjectMobileTabs projectId={projectId} />
            </div>

            {/* Desktop View: Split Screen */}
            <div className="hidden md:flex flex-col h-full w-full relative overflow-hidden bg-luxury-bg">
                <div className="flex-1 w-full min-h-0 relative grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
                    {/* Main Chat Area */}
                    <main className="relative flex flex-col min-h-0 bg-black/20 overflow-hidden">
                        <Suspense fallback={<div className="flex-1 bg-luxury-bg animate-pulse" />}>
                            <ChatWidget key={projectId} projectId={projectId} variant="inline" />
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
