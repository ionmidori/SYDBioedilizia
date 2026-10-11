import type { Metadata } from 'next';

import { DossierPreview } from '@/components/admin/DossierPreview';

export const metadata: Metadata = { title: 'Preventivo | Console admin SYD' };

export default async function AdminQuoteDossierPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <DossierPreview projectId={projectId} />;
}
