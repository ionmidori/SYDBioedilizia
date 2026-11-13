import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { z } from 'zod';
import { isBrowser } from '@/lib/portfolio/runtime';

export const TESTIMONIALS_REVALIDATE_SECONDS = 300;

const BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';
const BUILD_TIMEOUT_MS = 5_000;
const RUNTIME_TIMEOUT_MS = 8_000;

export const publicTestimonialSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  location: z.string().optional().default(''),
  text: z.string(),
  rating: z.number(),
});

export type PublicTestimonial = z.infer<typeof publicTestimonialSchema>;

let lastGood: PublicTestimonial[] | null = null;

export function resetServerTestimonialsMemory(): void {
  lastGood = null;
}

export function resolveServerTestimonials(
  items: PublicTestimonial[] | null,
): PublicTestimonial[] {
  if (items !== null) {
    lastGood = items.length > 0 ? items : null;
    return items;
  }
  return lastGood ?? [];
}

async function requestTestimonials(): Promise<PublicTestimonial[] | null> {
  const isBuild = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
  try {
    const res = await fetch(`${BACKEND_URL}/api/content/testimonials`, {
      next: { revalidate: TESTIMONIALS_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(isBuild ? BUILD_TIMEOUT_MS : RUNTIME_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    const parsed = z.array(publicTestimonialSchema).safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error('[testimonials] server fetch failed:', error);
    return null;
  }
}

export async function getTestimonials(): Promise<PublicTestimonial[]> {
  if (isBrowser()) {
    throw new Error('lib/testimonials/server is server-only');
  }
  const items = await requestTestimonials();
  return resolveServerTestimonials(items);
}
