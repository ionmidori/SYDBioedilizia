import type { Metadata } from 'next';

import { BatchList } from '@/components/admin/batches/BatchList';

export const metadata: Metadata = { title: 'Lotti | Console admin SYD' };

export default function AdminBatchesPage() {
  return <BatchList />;
}
