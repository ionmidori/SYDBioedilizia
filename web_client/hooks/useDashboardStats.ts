import { useEffect, useState, useMemo } from 'react';
import { collection, query, getDocs, orderBy, limit, collectionGroup, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { ActivityItem } from '@/components/dashboard/ActivityFeed';

interface DashboardStats {
    activeProjects: number; // New field
    totalFiles: number;
    totalRenders: number;
    recentActivity: ActivityItem[];
}

export function useDashboardStats() {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats>({
        activeProjects: 0,
        totalFiles: 0,
        totalRenders: 0,
        recentActivity: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.uid || !db) return;

        const fetchStats = async () => {
            setLoading(true);
            setError(null);

            try {
                // Fetch all data in parallel
                const [projectsSnapshot, filesSnapshot] = await Promise.all([
                    getDocs(query(
                        collection(db, 'sessions'),
                        where('userId', '==', user.uid),
                        where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // 7 days rule
                    )),
                    getDocs(query(
                        collectionGroup(db, 'files'),
                        where('uploadedBy', '==', user.uid),
                        orderBy('uploadedAt', 'desc'),
                        limit(50)
                    ))
                ]);

                // Filter out ephemeral/empty projects (named "Nuovo Progetto" or missing name)
                const realProjects = projectsSnapshot.docs.filter(doc => {
                    const data = doc.data();
                    const name = data.name || data.title;
                    return name && name !== 'Nuovo Progetto';
                });

                // Count projects (All non-empty projects are considered Active for the user)
                const activeProjects = realProjects.length;

                // Process files and associate them with their project
                const files = filesSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const pathParts = doc.ref.path.split('/');
                    const projectId = pathParts[1]; // projects/{projectId}/files/{fileId}

                    return {
                        id: doc.id,
                        projectId,
                        ...data
                    };
                }) as any[];

                // Only count files belonging to our active projects
                const realProjectIds = new Set(realProjects.map(p => p.id));
                const activeFiles = files.filter(f => realProjectIds.has(f.projectId));

                const totalFiles = activeFiles.filter(f => f.type === 'image' || f.type === 'video').length;
                const totalRenders = activeFiles.filter(f => f.type === 'render').length;

                // Create activity feed
                const projectsMap = new Map(
                    projectsSnapshot.docs.map(doc => [doc.id, doc.data().name || 'Progetto Senza Nome'])
                );

                const recentActivity: ActivityItem[] = files
                    .slice(0, 10)
                    .map((file: any) => ({
                        id: file.id,
                        type: file.type === 'render' ? 'render_generated' :
                            file.type === 'document' ? 'quote_generated' : 'file_upload',
                        projectName: projectsMap.get(file.projectId) || 'Progetto Sconosciuto',
                        fileName: file.name,
                        timestamp: file.uploadedAt?.toDate() || new Date()
                    }));

                setStats({
                    activeProjects,
                    totalFiles,
                    totalRenders,
                    recentActivity
                });
            } catch (err) {
                console.error('[useDashboardStats] Error fetching stats:', err);
                setError('Impossibile caricare le statistiche');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user?.uid]);

    return { stats, loading, error };
}
