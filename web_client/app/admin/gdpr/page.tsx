import type { Metadata } from 'next';

import { GdprMonitor } from '@/components/admin/gdpr/GdprMonitor';

export const metadata: Metadata = { title: 'GDPR | Console admin SYD' };

export default function AdminGdprPage() {
  return <GdprMonitor />;
}
