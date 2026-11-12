'use client';

/* eslint-disable @next/next/no-img-element -- Storage URLs validated by the server */
import { useState } from 'react';
import { EyeOff, ImageOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { PortfolioForm } from '@/components/admin/portfolio/PortfolioForm';
import { StatusChip } from '@/components/admin/StatusChip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAdminPortfolio, useDeletePortfolioProject, useUpdatePortfolioProject } from '@/hooks/admin/use-admin';
import type { PortfolioProject } from '@/types/admin-content';

/** "I nostri capolavori": the gallery of the public site. Hidden projects stay here but not on the site. */
export function PortfolioManager() {
  const portfolio = useAdminPortfolio();
  const update = useUpdatePortfolioProject();
  const remove = useDeletePortfolioProject();
  // undefined = closed, null = new project, otherwise the project being edited
  const [editing, setEditing] = useState<PortfolioProject | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<PortfolioProject | null>(null);

  return (
    <section className="space-y-5" aria-labelledby="portfolio-title" data-testid="portfolio">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="portfolio-title" className="text-2xl font-semibold">
            Portfolio
          </h1>
          <p className="text-sm text-ink-muted">
            {portfolio.data
              ? `${portfolio.data.items.length} progetti · ${portfolio.data.visible} visibili sul sito.`
              : 'La galleria dei lavori sul sito pubblico.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(null)}
          data-testid="portfolio-add"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary transition-colors text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden /> Aggiungi progetto
        </button>
      </div>

      <ErrorBanner error={update.error} />

      {portfolio.isPending ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-ink" aria-label="Caricamento" />
        </div>
      ) : portfolio.isError ? (
        <p role="alert" className="py-10 text-center text-sm text-danger-ink">
          Impossibile caricare il portfolio. Riprova tra poco.
        </p>
      ) : portfolio.data.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted" data-testid="portfolio-empty">
          Nessun progetto ancora: il sito mostra quelli di esempio. Aggiungi il primo con «Aggiungi progetto».
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {portfolio.data.items.map((project) => (
            <li key={project.id} className="bg-surface shadow-1 rounded-2xl border border-line overflow-hidden flex flex-col" data-testid="portfolio-card">
              <div className="aspect-[4/3] bg-surface flex items-center justify-center text-ink-subtle">
                {project.image_url ? (
                  <img src={project.image_url} alt={project.title} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <ImageOff className="w-8 h-8" aria-label="Nessuna immagine" />
                )}
              </div>
              <div className="p-4 space-y-2 flex-1 flex flex-col">
                <div className="flex items-start gap-2">
                  <h2 className="font-medium flex-1" data-testid="portfolio-card-title">
                    {project.title}
                  </h2>
                  <span className="text-xs tabular-nums text-ink-muted">#{project.order}</span>
                </div>
                <p className="text-xs text-ink-muted">
                  {project.category} · {project.location}
                </p>
                {!project.active && (
                  <StatusChip label="Nascosto" className="text-ink-muted bg-surface border-line" testId="portfolio-hidden" />
                )}
                <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: project.id, body: { active: !project.active } })}
                    disabled={update.isPending}
                    aria-pressed={project.active}
                    data-testid="portfolio-toggle"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm hover:bg-surface disabled:opacity-50 cursor-pointer"
                  >
                    <EyeOff className="w-4 h-4" aria-hidden /> {project.active ? 'Nascondi' : 'Mostra sul sito'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(project)}
                    aria-label={`Modifica ${project.title}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm hover:bg-surface cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" aria-hidden /> Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove.reset();
                      setDeleting(project);
                    }}
                    aria-label={`Elimina ${project.title}`}
                    className="ml-auto p-2 rounded-lg text-ink-muted hover:text-danger-ink hover:bg-danger-subtle cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PortfolioForm
        project={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-md bg-surface border-line text-ink">
          <DialogHeader>
            <DialogTitle>Eliminare il progetto?</DialogTitle>
            <DialogDescription>
              «{deleting?.title}» sparisce dal sito e la sua immagine viene cancellata. Non si può annullare. Per toglierlo
              solo temporaneamente usa «Nascondi».
            </DialogDescription>
          </DialogHeader>
          <ErrorBanner error={remove.error} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl border border-line text-sm hover:bg-surface cursor-pointer">
              Annulla
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
              data-testid="portfolio-delete-confirm"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-danger text-on-danger text-sm disabled:opacity-50 cursor-pointer"
            >
              {remove.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              Elimina
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
