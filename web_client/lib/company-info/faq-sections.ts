import type { FaqCategory, FaqItem } from '@/types/company-info';

export type FaqSection = FaqCategory & {
  sectionId: string;
  items: FaqItem[];
};

/**
 * Normalize a category label into an ASCII, kebab-case HTML section id.
 */
export function toSectionId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Group FAQ items under their ordered categories, omitting empty categories.
 */
export function buildFaqSections(categories: FaqCategory[], faq: FaqItem[]): FaqSection[] {
  return categories
    .map((category) => ({
      ...category,
      sectionId: toSectionId(category.name),
      items: faq.filter((item) => item.category === category.name),
    }))
    .filter((section) => section.items.length > 0);
}
