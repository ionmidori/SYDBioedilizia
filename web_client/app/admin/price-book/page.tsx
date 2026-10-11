import type { Metadata } from 'next';

import { PriceBookEditor } from '@/components/admin/price-book/PriceBookEditor';

export const metadata: Metadata = { title: 'Listino prezzi | Console admin SYD' };

export default function AdminPriceBookPage() {
  return <PriceBookEditor />;
}
