import { useEffect, useState, useMemo } from 'react';
import { collection, query, getDocs, orderBy, limit, collectionGroup } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { ActivityItem } from '@/components/dashboard/ActivityFeed';

interface DashboardStats {
    totalProjects: number;
    totalFiles: number;
    totalRenders: number;
    recentActivity: ActivityItem[];
}

export function useDashboardStats() {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats>({
        totalProjects: 0,
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
                    getDocs(collection(db, 'projects')),
                    getDocs(query(
                        collectionGroup(db, 'files'),
                        orderBy('uploadedAt', 'desc'),
                        limit(50)
                    ))
                ]);

                // Count projects
                const totalProjects = projectsSnapshot.size;

                // Process files
                const files = filesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    projectId: doc.ref.path.split('/')[1]
                }));

                const totalFiles = files.length;
                const totalRenders = files.filter((f: any) => f.type === 'render').length;

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
                    totalProjects,
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
