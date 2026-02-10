'use client';

import { useParams } from 'next/navigation';
import { ProjectSettingsView } from '@/components/dashboard/ProjectSettingsView';

export default function ProjectSettingsPage() {
    const params = useParams();
    const projectId = params.id as string;

    return <ProjectSettingsView projectId={projectId} />;
}
