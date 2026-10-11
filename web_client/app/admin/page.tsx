import type { Metadata } from 'next';

import { KpiDashboard } from '@/components/admin/dashboard/KpiDashboard';

export const metadata: Metadata = { title: 'Dashboard | Console admin SYD' };

export default function AdminHome() {
  return <KpiDashboard />;
}
