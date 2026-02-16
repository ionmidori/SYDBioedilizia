import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { statsApi, DashboardStats } from '@/lib/stats-api';

const DEFAULT_STATS: DashboardStats = {
    activeProjects: 0,
    totalFiles: 0,
    totalRenders: 0,
    recentActivity: []
};

export function useDashboardStats() {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await statsApi.getStats();
                setStats(data);
            } catch (err) {
                console.error('[useDashboardStats] Error fetching stats:', err);
                setError('Impossibile caricare le statistiche');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    return { stats, loading, error };
}
