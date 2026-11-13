import { GET } from '@/app/llms.txt/route';
import { BLOG_POSTS } from '@/lib/blog';
import { buildLlmsTxt } from '@/lib/company-info/llms';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { getCompanyInfo } from '@/lib/company-info/server';
import { exampleProjects } from '@/lib/portfolio/examples';
import { getPortfolio } from '@/lib/portfolio/server';
import type { PortfolioItem } from '@/lib/portfolio';
import { SITE_URL } from '@/lib/site';

jest.mock('@/lib/company-info/server', () => ({ getCompanyInfo: jest.fn() }));
jest.mock('@/lib/portfolio/server', () => ({ getPortfolio: jest.fn() }));

if (typeof globalThis.Response === 'undefined') {
  class PolyfillResponse {
    readonly status: number;
    readonly headers: Headers;
    private readonly bodyText: string;

    constructor(body: BodyInit | null = '', init?: ResponseInit) {
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
      this.bodyText = typeof body === 'string' ? body : String(body ?? '');
    }

    async text(): Promise<string> {
      return this.bodyText;
    }
  }
  globalThis.Response = PolyfillResponse as unknown as typeof Response;
}

const sampleProject: PortfolioItem = {
  id: 'proj-1',
  title: 'Attico Balduina Bio',
  category: 'Ristrutturazione Completa',
  location: 'Roma Balduina',
  image: 'https://storage.example/balduina.webp',
  description: 'Riqualificazione energetica completa con isolanti Classe A1.',
  stats: { area: '95 mq', duration: '65 gg', budget: '' },
};

describe('dynamic /llms.txt route and generator', () => {
  beforeEach(() => {
    (getCompanyInfo as jest.Mock).mockResolvedValue(SEED_COMPANY_INFO);
    (getPortfolio as jest.Mock).mockResolvedValue([sampleProject]);
  });

  it('serves dynamic plain text from GET /llms.txt matching company info, projects, and blog', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/plain/);

    const text = await res.text();
    expect(text).toContain(SEED_COMPANY_INFO.identity.name);
    expect(text).toContain(SEED_COMPANY_INFO.identity.phone);
    expect(text).toContain(SEED_COMPANY_INFO.identity.email);
    expect(text).toContain(SEED_COMPANY_INFO.service_area.summary);
    expect(text).toContain(`${SITE_URL}/progetti`);
    expect(text).toContain(`${SITE_URL}/chi-siamo`);
    expect(text).toContain(`${SITE_URL}/blog`);
    expect(text).toContain(`${SITE_URL}/faq`);
    expect(text).toContain('Attico Balduina Bio');
    expect(text).toContain('Roma Balduina');
    expect(text).toContain(`${SITE_URL}/blog/${BLOG_POSTS[0].slug}`);
  });

  it('never leaks outdated geographic claims, Sismabonus, or stock examples', () => {
    const bodyWithNoRealProjects = buildLlmsTxt(SEED_COMPANY_INFO, [], BLOG_POSTS);
    const [operationalSection] = bodyWithNoRealProjects.split('## FAQ');

    expect(operationalSection).not.toMatch(/Milano/i);
    expect(operationalSection).not.toMatch(/Imagen 3/i);
    expect(bodyWithNoRealProjects).not.toMatch(/tutta Italia|tutta la penisola/i);
    expect(bodyWithNoRealProjects).not.toMatch(/Sismabonus|Bonus Casa/i);
    expect(bodyWithNoRealProjects).toContain('non gestisce le pratiche dei bonus fiscali');
    for (const example of exampleProjects) {
      expect(bodyWithNoRealProjects).not.toContain(example.title);
    }
    expect(bodyWithNoRealProjects).not.toContain('## Progetti Realizzati');
  });
});
