'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreatePortfolioProject, useUpdatePortfolioProject, useUploadPortfolioImage } from '@/hooks/admin/use-admin';
import { describeUploadError } from '@/lib/admin/admin-errors';
import { prepareImageForUpload } from '@/lib/admin/image-prep';
import {
  PORTFOLIO_CATEGORIES,
  type PortfolioPatch,
  portfolioPatchSchema,
  type PortfolioProject,
  portfolioWriteSchema,
} from '@/types/admin-content';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

const FIELD =
  'w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50';

interface FormState {
  title: string;
  category: string;
  location: string;
  description: string;
  area: string;
  duration: string;
  budget: string;
  active: boolean;
  order: string;
  imageUrl: string;
}

function initial(project: PortfolioProject | null): FormState {
  return {
    title: project?.title ?? '',
    // A category outside the list (old data) is kept as it is: saving must not silently change it.
    category: project?.category || PORTFOLIO_CATEGORIES[0],
    location: project?.location ?? '',
    description: project?.description ?? '',
    area: project?.stats.area ?? '',
    duration: project?.stats.duration ?? '',
    budget: project?.stats.budget ?? '',
    active: project?.active ?? true,
    order: String(project?.order ?? ''),
    imageUrl: project?.image_url ?? '',
  };
}

/** Only what the admin changed, so an edit never rewrites the fields it did not touch. */
export function buildPatch(project: PortfolioProject, form: FormState): PortfolioPatch {
  const patch: PortfolioPatch = {};
  if (form.title.trim() !== project.title) patch.title = form.title.trim();
  if (form.category !== project.category) patch.category = form.category as PortfolioPatch['category'];
  if (form.location.trim() !== project.location) patch.location = form.location.trim();
  if (form.description.trim() !== project.description) patch.description = form.description.trim();
  if (form.area !== project.stats.area || form.duration !== project.stats.duration || form.budget !== project.stats.budget) {
    patch.stats = { area: form.area.trim(), duration: form.duration.trim(), budget: form.budget.trim() };
  }
  if (form.imageUrl && form.imageUrl !== (project.image_url ?? '')) patch.image_url = form.imageUrl;
  if (form.active !== project.active) patch.active = form.active;
  const order = Number(form.order);
  if (Number.isInteger(order) && order >= 1 && order !== project.order) patch.order = order;
  return patch;
}

const PROBLEMS: Record<string, string> = {
  image_url: "Carica un'immagine.",
  title: 'Il titolo è obbligatorio.',
  location: 'La città o zona è obbligatoria.',
};

function problemFor(field: string): string {
  return PROBLEMS[field] ?? 'Controlla i campi.';
}

interface Props {
  /** null = a new project. */
  project: PortfolioProject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PortfolioForm({ project, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-luxury-bg border-luxury-gold/20 text-luxury-text">
        <DialogHeader>
          <DialogTitle>{project ? 'Modifica progetto' : 'Nuovo progetto'}</DialogTitle>
          <DialogDescription>Quello che salvi compare nella galleria del sito pubblico.</DialogDescription>
        </DialogHeader>
        {/* Mounted per opening: the form starts from the project, never from the previous one. */}
        {open && <FormBody project={project} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FormBody({ project, onDone }: { project: PortfolioProject | null; onDone: () => void }) {
  const [form, setForm] = useState<FormState>(() => initial(project));
  const [problems, setProblems] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useUploadPortfolioImage();
  const create = useCreatePortfolioProject();
  const update = useUpdatePortfolioProject();
  const saving = create.isPending || update.isPending;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const choose = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      setFileError('Formato non supportato: usa JPG, PNG, WebP o GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFileError('Immagine troppo grande: massimo 10 MB.');
      return;
    }
    setPreparing(true);
    void prepareImageForUpload(file)
      .then((ready) => upload.mutate(ready, { onSuccess: (result) => set('imageUrl', result.image_url) }))
      .finally(() => setPreparing(false));
  };

  const submit = () => {
    setProblems([]);
    if (project) {
      const patch = buildPatch(project, form);
      if (Object.keys(patch).length === 0) {
        onDone();
        return;
      }
      const checked = portfolioPatchSchema.safeParse(patch);
      if (!checked.success) {
        setProblems(checked.error.issues.map((issue) => problemFor(String(issue.path[0]))));
        return;
      }
      update.mutate({ id: project.id, body: patch }, { onSuccess: onDone });
      return;
    }
    const parsed = portfolioWriteSchema.safeParse({
      title: form.title,
      category: form.category,
      location: form.location,
      description: form.description,
      stats: { area: form.area.trim(), duration: form.duration.trim(), budget: form.budget.trim() },
      image_url: form.imageUrl,
      active: form.active,
    });
    if (!parsed.success) {
      setProblems(parsed.error.issues.map((issue) => problemFor(String(issue.path[0]))));
      return;
    }
    create.mutate(parsed.data, { onSuccess: onDone });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <fieldset className="space-y-2" disabled={saving}>
        <legend className="text-sm font-medium">Immagine</legend>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-40 h-28 rounded-xl border border-dashed border-white/20 bg-white/5 overflow-hidden flex items-center justify-center text-luxury-text/40">
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage URL validated by the server
              <img src={form.imageUrl} alt="Anteprima" className="w-full h-full object-cover" data-testid="portfolio-preview" />
            ) : (
              <ImagePlus className="w-8 h-8" aria-hidden />
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = ''; // the same file can be chosen again after an error
              }}
              disabled={upload.isPending || preparing}
              aria-label="Scegli un'immagine"
              data-testid="portfolio-file"
              className="block text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="text-xs text-luxury-text/50">JPG, PNG, WebP o GIF, max 10 MB. Viene ridimensionata e ripulita dai dati nascosti (posizione GPS inclusa).</p>
            {(upload.isPending || preparing) && (
              <p className="inline-flex items-center gap-1.5 text-xs text-luxury-gold" role="status">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Caricamento in corso…
              </p>
            )}
            {fileError && (
              <p role="alert" className="text-xs text-red-400" data-testid="portfolio-file-error">
                {fileError}
              </p>
            )}
          </div>
        </div>
        <ErrorBanner error={upload.error} describe={describeUploadError} />
      </fieldset>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm">Titolo *</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} data-testid="portfolio-title" className={FIELD} />
        </label>
        <label className="space-y-1">
          <span className="text-sm">Categoria *</span>
          <select value={form.category} onChange={(e) => set('category', e.target.value)} className={FIELD}>
            {(PORTFOLIO_CATEGORIES as readonly string[]).includes(form.category)
              ? null
              : (
                <option value={form.category}>{form.category} (non in elenco)</option>
              )}
            {PORTFOLIO_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm">Città / zona *</span>
          <input value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={120} data-testid="portfolio-location" className={FIELD} />
        </label>
        {project && (
          <label className="space-y-1">
            <span className="text-sm">Ordine nella galleria</span>
            <input type="number" min={1} max={10000} value={form.order} onChange={(e) => set('order', e.target.value)} className={FIELD} />
          </label>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-sm">Descrizione</span>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000} className={FIELD} />
      </label>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-sm">Superficie (es. 120 mq)</span>
          <input value={form.area} onChange={(e) => set('area', e.target.value)} maxLength={40} className={FIELD} />
        </label>
        <label className="space-y-1">
          <span className="text-sm">Durata (es. 3 mesi)</span>
          <input value={form.duration} onChange={(e) => set('duration', e.target.value)} maxLength={40} className={FIELD} />
        </label>
        <label className="space-y-1">
          <span className="text-sm">Budget (es. €85k)</span>
          <input value={form.budget} onChange={(e) => set('budget', e.target.value)} maxLength={40} className={FIELD} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Visibile sul sito
      </label>

      {problems.length > 0 && (
        <ul role="alert" data-testid="portfolio-problems" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {[...new Set(problems)].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ErrorBanner error={create.error ?? update.error} />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer">
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving || upload.isPending || preparing}
          data-testid="portfolio-save"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          Salva progetto
        </button>
      </div>
    </form>
  );
}
