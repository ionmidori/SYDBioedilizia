'use client';

import { useParams } from 'next/navigation';
import { ProjectFilesView } from '@/components/dashboard/ProjectFilesView';

export default function ProjectFilesPage() {
    const params = useParams();
    const projectId = params.id as string;

    return <ProjectFilesView projectId={projectId} />;
}
