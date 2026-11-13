import { BLOG_POSTS } from '@/lib/blog';
import { buildLlmsTxt } from '@/lib/company-info/llms';
import { getCompanyInfo } from '@/lib/company-info/server';
import { getPortfolio } from '@/lib/portfolio/server';

export const revalidate = 300;

export async function GET(): Promise<Response> {
  const [info, projects] = await Promise.all([getCompanyInfo(), getPortfolio()]);
  const body = buildLlmsTxt(info, projects, BLOG_POSTS);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
