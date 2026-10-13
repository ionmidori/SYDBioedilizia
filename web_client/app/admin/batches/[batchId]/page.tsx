import type { Metadata } from 'next';

import { BatchDetail } from '@/components/admin/batches/BatchDetail';

export const metadata: Metadata = { title: 'Lotto | Console admin SYD' };

export default async function AdminBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <BatchDetail batchId={batchId} />;
}
