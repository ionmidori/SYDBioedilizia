import type { Metadata } from 'next';

import { PortfolioManager } from '@/components/admin/portfolio/PortfolioManager';

export const metadata: Metadata = { title: 'Portfolio | Console admin SYD' };

export default function AdminPortfolioPage() {
  return <PortfolioManager />;
}
