import type { Metadata } from 'next';

import { DossierView } from '@/components/admin/DossierView';

export const metadata: Metadata = { title: 'Preventivo | Console admin SYD' };

export default async function AdminQuoteDossierPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <DossierView projectId={projectId} />;
}
