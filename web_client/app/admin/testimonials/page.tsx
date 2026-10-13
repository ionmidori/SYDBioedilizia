import type { Metadata } from 'next';

import { TestimonialModeration } from '@/components/admin/testimonials/TestimonialModeration';

export const metadata: Metadata = { title: 'Recensioni | Console admin SYD' };

export default function AdminTestimonialsPage() {
  return <TestimonialModeration />;
}
