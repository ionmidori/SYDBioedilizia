import type { BlogPost } from '@/lib/blog';
import { blocksToPlainText } from '@/lib/company-info/blocks';
import { fullAddress } from '@/lib/company-info/format';
import { VCARD_PATH } from '@/lib/company-info/vcard';
import type { PortfolioItem } from '@/lib/portfolio';
import { SITE_URL } from '@/lib/site';
import type { CompanyInfo } from '@/types/company-info';

const POLICY_SECTION_SLUGS = [
  'bonus-fiscali',
  'pratiche-permessi',
  'tempi-lavori',
  'pagamenti',
  'chi-lavora',
  'certificazioni-materiali',
  'garanzie',
  'social',
] as const;

type MaybeExample = PortfolioItem & { isExample?: boolean };

function formatOpeningHours(info: CompanyInfo): string {
  if (info.hours.length === 0) return info.hours_note || 'Su appuntamento';
  const slots = info.hours.map((h) => `${h.days}: ${h.opens}-${h.closes}`).join('; ');
  return info.hours_note ? `${slots} (${info.hours_note})` : slots;
}

/**
 * Generate structured Markdown for AI crawlers and GEO discovery (`/llms.txt`),
 * strictly derived from the single-source-of-truth Company Info, real portfolio
 * projects, and published blog guides.
 */
export function buildLlmsTxt(
  info: CompanyInfo,
  projects: readonly MaybeExample[],
  posts: readonly BlogPost[],
): string {
  const { identity, service_area, services, site_visit, quote_terms, sections, faq, about } = info;
  const missionIntro = blocksToPlainText(about.intro);
  const siteVisitText = blocksToPlainText(site_visit);
  const realProjects = projects.filter((project) => !project.isExample);

  const lines: string[] = [
    `# ${identity.name} - Ristrutturazioni e Bioedilizia (${service_area.summary})`,
    '',
    '## Mission',
    services.summary,
    ...(missionIntro ? ['', missionIntro] : []),
    '',
    '## Contatti e Sede',
    `- Ragione sociale: ${identity.legal_name} (P.IVA ${identity.vat_id})`,
    `- Sede: ${fullAddress(identity)}`,
    `- Telefono: ${identity.phone}`,
    ...(identity.whatsapp ? [`- WhatsApp: ${identity.whatsapp}`] : []),
    `- Email: ${identity.email}`,
    `- Orari: ${formatOpeningHours(info)}`,
    '',
    '## Area Operativa',
    `- Area coperta in via esclusiva: ${service_area.summary} (${service_area.places.length} comuni serviti nella Città metropolitana di Roma Capitale).`,
    `- Comuni principali: ${service_area.places.join(', ')}`,
    '',
    '## Servizi e Policy',
    ...services.items.map((item) =>
      item.description ? `- **${item.title}**: ${item.description}` : `- **${item.title}**`,
    ),
    ...(siteVisitText ? ['', `- **Sopralluogo**: ${siteVisitText}`] : []),
    `- **Pagamenti SAL**: ${quote_terms.payment_terms.join(' | ')}`,
    `- **Validità preventivo**: ${quote_terms.validity_days} giorni (${quote_terms.short_notice})`,
  ];

  for (const slug of POLICY_SECTION_SLUGS) {
    const section = sections.find((item) => item.slug === slug);
    if (!section) continue;
    const text = blocksToPlainText(section.blocks);
    if (text) lines.push(`- **${section.title}**: ${text}`);
  }

  lines.push(
    '',
    '## Key Resources',
    `- [Home](${SITE_URL}/): Panoramica servizi, assistente AI e portfolio lavori.`,
    `- [Progetti Realizzati](${SITE_URL}/progetti): Archivio ristrutturazioni completate a Roma e provincia.`,
    `- [Chi Siamo](${SITE_URL}/chi-siamo): Storia tecnica, filosofia costruttiva ed eccellenze.`,
    `- [Blog Tecnico](${SITE_URL}/blog): Guide pratiche su costi, materiali e ristrutturazioni a Roma.`,
    `- [Domande Frequenti (FAQ)](${SITE_URL}/faq): Risposte su prezzi, tempistiche, permessi CILA/SCIA e procedure.`,
    `- [Scheda Contatto vCard](${SITE_URL}${VCARD_PATH}): Recapiti ufficiali aggiornati.`,
  );

  if (realProjects.length > 0) {
    lines.push('', '## Progetti Realizzati');
    for (const project of realProjects) {
      const meta = [project.category, project.location].filter(Boolean).join(' - ');
      lines.push(`- **${project.title}** (${meta}): ${project.description}`);
    }
  }

  if (posts.length > 0) {
    lines.push('', '## Blog Articles');
    for (const post of posts) {
      lines.push(`- [${post.title}](${SITE_URL}/blog/${post.slug}): ${post.excerpt}`);
    }
  }

  if (faq.length > 0) {
    lines.push('', '## FAQ');
    for (const item of faq) {
      lines.push(`- **${item.question}** ${blocksToPlainText(item.answer)}`);
    }
  }

  lines.push(
    '',
    '## Citations',
    `> "${identity.name} (${new Date().getFullYear()}). ${services.summary} Disponibile su: ${SITE_URL}"`,
    '',
  );

  return lines.join('\n');
}
