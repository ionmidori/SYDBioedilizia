import { fetchWithAuth } from '@/lib/api-client';

export interface DashboardStats {
    activeProjects: number;
    totalFiles: number;
    totalRenders: number;
    recentActivity: ActivityItem[];
}

export interface ActivityItem {
    id: string;
    type: 'render_generated' | 'quote_generated' | 'file_upload';
    projectName: string;
    fileName: string;
    timestamp: Date;
}

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

export const statsApi = {
    getStats: async (): Promise<DashboardStats> => {
        const response = await fetchWithAuth(`${API_ROOT}/reports/dashboard`);
        if (!response.ok) {
            throw new Error('Impossibile caricare le statistiche');
        }
        const data = await response.json();
        return {
            ...data,
            recentActivity: data.recentActivity.map((item: any) => ({
                ...item,
                timestamp: new Date(item.timestamp)
            }))
        };
    }
};
