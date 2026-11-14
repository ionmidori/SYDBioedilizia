"use client";

import { useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, HelpCircle, MessageSquare, Search, X } from "lucide-react";
import { FAQItemCard } from "@/components/faq/FAQItem";
import { OpenChatButton } from "@/components/ui/open-chat-button";
import { blocksToPlainText } from "@/lib/company-info/blocks";
import type { FaqSection } from "@/lib/company-info/faq-sections";
import { COMPANY_ICONS } from "@/lib/company-info/icons";
import { cn } from "@/lib/utils";

interface FAQExplorerProps {
  sections: FaqSection[];
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function FAQExplorer({ sections }: FAQExplorerProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const normalizedQuery = normalizeSearch(query);
  const trimmedQuery = query.trim();

  const filteredSections = useMemo(() => {
    return sections
      .filter((section) => !activeCategory || section.sectionId === activeCategory)
      .map((section) => {
        if (!normalizedQuery) {
          return section;
        }
        const matchingItems = section.items.filter((item) => {
          const haystack = normalizeSearch(
            `${item.question} ${item.category} ${blocksToPlainText(item.answer)}`
          );
          return haystack.includes(normalizedQuery);
        });
        return { ...section, items: matchingItems };
      })
      .filter((section) => section.items.length > 0);
  }, [sections, activeCategory, normalizedQuery]);

  const visibleItems = useMemo(
    () => filteredSections.flatMap((section) => section.items),
    [filteredSections]
  );

  const visibleCount = visibleItems.length;
  const allExpanded =
    visibleCount > 0 && visibleItems.every((item) => expandedMap[item.slug] === true);

  const handleToggleItem = (slug: string, open: boolean) => {
    setExpandedMap((prev) => ({ ...prev, [slug]: open }));
  };

  const handleToggleAll = () => {
    if (visibleCount === 0) return;
    const nextValue = !allExpanded;
    setExpandedMap((prev) => {
      const next = { ...prev };
      for (const item of visibleItems) {
        next[item.slug] = nextValue;
      }
      return next;
    });
  };

  const handleResetFilters = () => {
    setQuery("");
    setActiveCategory(null);
  };

  return (
    <div>
      {/* Sticky Search & Filter Bar on md+ (opaque surface per DESIGN.md Opaque Stack Rule) */}
      <div className="md:sticky md:top-20 z-20 mb-10 rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-1">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-ink-muted pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="faq-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cerca nelle domande frequenti"
              placeholder="Cerca costi al mq, CILA, materiali CAM, tempi..."
              className="w-full min-h-[44px] rounded-xl border border-line bg-canvas pl-11 pr-11 py-2.5 text-base md:text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary transition-colors [&::-webkit-search-cancel-button]:appearance-none"
            />
            {trimmedQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Cancella ricerca"
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-ink-muted hover:text-ink transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleAll}
            disabled={visibleCount === 0}
            aria-pressed={allExpanded}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-line bg-surface-muted hover:bg-canvas text-ink text-sm font-semibold transition-colors disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface shrink-0 cursor-pointer"
          >
            {allExpanded ? (
              <>
                <ChevronsDownUp className="w-4 h-4 text-primary-ink" aria-hidden="true" />
                Comprimi tutte
              </>
            ) : (
              <>
                <ChevronsUpDown className="w-4 h-4 text-primary-ink" aria-hidden="true" />
                Espandi tutte
              </>
            )}
          </button>
        </div>

        {/* Category Filter Pills */}
        <div
          role="group"
          aria-label="Filtra per categoria"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            aria-pressed={activeCategory === null}
            className={cn(
              "inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-full border text-sm font-medium transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              activeCategory === null
                ? "bg-primary text-on-primary border-primary shadow-1"
                : "bg-canvas text-ink border-line hover:bg-surface-muted hover:border-line-strong"
            )}
          >
            Tutte
          </button>

          {sections.map((section) => {
            const Icon = COMPANY_ICONS[section.icon] ?? HelpCircle;
            const isActive = activeCategory === section.sectionId;
            return (
              <button
                key={section.sectionId}
                type="button"
                onClick={() =>
                  setActiveCategory((prev) =>
                    prev === section.sectionId ? null : section.sectionId
                  )
                }
                aria-pressed={isActive}
                className={cn(
                  "inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-full border text-sm font-medium transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  isActive
                    ? "bg-primary text-on-primary border-primary shadow-1"
                    : "bg-canvas text-ink border-line hover:bg-surface-muted hover:border-line-strong"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{section.name}</span>
              </button>
            );
          })}
        </div>

        {/* Live Result Summary */}
        <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span aria-live="polite" aria-atomic="true">
            {trimmedQuery
              ? `${visibleCount} ${visibleCount === 1 ? "risultato" : "risultati"} per "${trimmedQuery}"`
              : `${visibleCount} ${visibleCount === 1 ? "domanda" : "domande"} in ${filteredSections.length} ${filteredSections.length === 1 ? "categoria" : "categorie"}`}
          </span>
          {(trimmedQuery || activeCategory !== null) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center min-h-[44px] px-2.5 text-primary-ink hover:underline font-medium cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Mostra tutte le FAQ
            </button>
          )}
        </div>
      </div>

      {/* Results or Empty State */}
      {filteredSections.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 sm:p-10 text-center shadow-1">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-ink mb-3">
            Nessuna FAQ trovata{trimmedQuery ? ` per "${trimmedQuery}"` : ""}
          </h2>
          <p className="text-sm sm:text-base text-ink-muted max-w-lg mx-auto leading-relaxed mb-6">
            Non abbiamo trovato questa risposta nell&apos;archivio. Puoi chiedere subito a SYD
            oppure ripristinare i filtri per consultare tutte le domande.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <OpenChatButton
              prompt={
                trimmedQuery
                  ? `Ciao SYD, ho cercato "${trimmedQuery}" nelle FAQ senza risultato. Puoi aiutarmi?`
                  : "Ciao SYD, avrei una domanda che non trovo nelle FAQ."
              }
              className="bg-primary text-on-primary hover:bg-primary-hover border-primary"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              Chiedi a SYD
            </OpenChatButton>
            {(trimmedQuery || activeCategory !== null) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-full border border-line bg-surface-muted hover:bg-canvas text-ink text-sm font-semibold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ripristina filtri
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-12 sm:space-y-16">
          {filteredSections.map((section) => {
            const Icon = COMPANY_ICONS[section.icon] ?? HelpCircle;
            return (
              <section
                key={section.sectionId}
                id={section.sectionId}
                className="scroll-mt-24 md:scroll-mt-60"
              >
                <div className="flex items-center gap-3 mb-6 pb-3 border-b border-line">
                  <div className="p-2.5 rounded-xl bg-surface-muted text-primary-ink border border-line">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold text-ink">{section.name}</h2>
                </div>

                <div className="space-y-4">
                  {section.items.map((item) => (
                    <FAQItemCard
                      key={item.slug}
                      item={item}
                      forceOpen={expandedMap[item.slug]}
                      onToggle={handleToggleItem}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
