import type { Metadata } from 'next';

import { QuoteInbox } from '@/components/admin/QuoteInbox';

export const metadata: Metadata = { title: 'Preventivi | Console admin SYD' };

export default function AdminQuotesPage() {
  return <QuoteInbox />;
}
