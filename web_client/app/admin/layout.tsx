import type { Metadata } from 'next';

import { AdminClientLayout } from '@/components/admin/AdminClientLayout';

// Strict CSP (per-request nonce) needs dynamic rendering, like /dashboard.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Console admin | SYD',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminClientLayout>{children}</AdminClientLayout>;
}
