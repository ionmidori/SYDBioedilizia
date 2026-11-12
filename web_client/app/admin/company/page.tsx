import type { Metadata } from 'next';

import { CompanyInfoEditor } from '@/components/admin/company/CompanyInfoEditor';

export const metadata: Metadata = { title: 'Società | Console admin SYD' };

export default function AdminCompanyPage() {
  return <CompanyInfoEditor />;
}
