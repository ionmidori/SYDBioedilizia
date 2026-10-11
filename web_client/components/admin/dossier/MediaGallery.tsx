'use client';

/* eslint-disable @next/next/no-img-element -- signed Storage URLs, not optimisable by next/image */
import { useCallback, useRef, useState } from 'react';
import { Download, ExternalLink, ImageOff, Link2, Video } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { adminApi } from '@/lib/admin/admin-api';
import type { DossierMedia } from '@/types/admin-quote';

/** Only http(s) links are rendered as links: the data comes from a client. */
function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const GROUPS: ReadonlyArray<{ title: string; kinds: ReadonlyArray<DossierMedia['kind']> }> = [
  { title: 'Foto iniziali', kinds: ['input_photo'] },
  { title: 'Render', kinds: ['render'] },
  { title: 'Video e link', kinds: ['video', 'link'] },
];

/**
 * Photos, renders and links of the request.
 *
 * Image URLs are short-lived (15 minutes): when one fails to load — expired
 * or revoked — the gallery asks the backend for a fresh one, once, then shows
 * a placeholder instead of looping.
 */
export function MediaGallery({ projectId, media }: { projectId: string; media: DossierMedia[] }) {
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [broken, setBroken] = useState<Record<string, true>>({});
  // A ref, not state: two failing <img> events in one tick must not both refresh.
  const retried = useRef(new Set<string>());
  const [openId, setOpenId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);

  const urlOf = useCallback((m: DossierMedia): string | null => fresh[m.media_id] ?? m.url ?? null, [fresh]);

  const refresh = useCallback(
    async (mediaId: string) => {
      if (retried.current.has(mediaId)) {
        setBroken((prev) => ({ ...prev, [mediaId]: true }));
        return;
      }
      retried.current.add(mediaId);
      try {
        const { url } = await adminApi.getMediaUrl(projectId, mediaId);
        setFresh((prev) => ({ ...prev, [mediaId]: url }));
      } catch {
        setBroken((prev) => ({ ...prev, [mediaId]: true }));
      }
    },
    [projectId],
  );

  const download = useCallback(
    async (mediaId: string) => {
      setDownloadError(false);
      try {
        const { url } = await adminApi.getMediaUrl(projectId, mediaId, 'attachment');
        window.location.assign(url);
      } catch {
        setDownloadError(true);
      }
    },
    [projectId],
  );

  if (media.length === 0) {
    return (
      <section className="glass-premium rounded-2xl p-4 border border-white/5" data-testid="gallery-empty">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-2">Foto e render</h2>
        <p className="text-sm text-luxury-text/60">Il cliente non ha allegato foto e non ci sono render.</p>
      </section>
    );
  }

  const images = media.filter((m) => (m.kind === 'input_photo' || m.kind === 'render') && urlOf(m) && !broken[m.media_id]);
  const openIndex = images.findIndex((m) => m.media_id === openId);
  const current = openIndex >= 0 ? images[openIndex] : null;
  const step = (delta: number) => {
    if (images.length === 0) return;
    setOpenId(images[(openIndex + delta + images.length) % images.length].media_id);
  };

  return (
    <section className="glass-premium rounded-2xl p-4 border border-white/5 space-y-4" data-testid="media-gallery">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold">Foto e render</h2>
      {GROUPS.map((group) => {
        const items = media.filter((m) => group.kinds.includes(m.kind));
        if (items.length === 0) return null;
        return (
          <div key={group.title} className="space-y-2">
            <h3 className="text-sm font-medium">
              {group.title} <span className="text-luxury-text/40">({items.length})</span>
            </h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((m) => (
                <li key={m.media_id}>
                  <MediaTile
                    media={m}
                    url={urlOf(m)}
                    broken={!!broken[m.media_id]}
                    onOpen={() => setOpenId(m.media_id)}
                    onError={() => void refresh(m.media_id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {downloadError && (
        <p role="alert" className="text-sm text-red-400">
          Download non riuscito. Riprova.
        </p>
      )}

      <Dialog open={!!current} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent
          className="max-w-4xl bg-luxury-bg border-luxury-gold/20 text-luxury-text"
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') step(1);
            if (event.key === 'ArrowLeft') step(-1);
          }}
        >
          <DialogTitle className="sr-only">{current?.label ?? 'Immagine'}</DialogTitle>
          <DialogDescription className="sr-only">Anteprima ingrandita. Usa le frecce per scorrere.</DialogDescription>
          {current && (
            <div className="space-y-3">
              <img
                src={urlOf(current) ?? undefined}
                alt={current.label}
                onError={() => void refresh(current.media_id)}
                className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
                data-testid="lightbox-image"
              />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{current.label}</span>
                <span className="text-luxury-text/50">
                  {openIndex + 1} / {images.length}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    disabled={images.length < 2}
                    className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                  >
                    Precedente
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    disabled={images.length < 2}
                    className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                  >
                    Successiva
                  </button>
                  <button
                    type="button"
                    onClick={() => void download(current.media_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-luxury-gold/15 border border-luxury-gold/30 text-luxury-gold cursor-pointer"
                  >
                    <Download className="w-4 h-4" aria-hidden /> Scarica
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MediaTile({
  media,
  url,
  broken,
  onOpen,
  onError,
}: {
  media: DossierMedia;
  url: string | null;
  broken: boolean;
  onOpen: () => void;
  onError: () => void;
}) {
  const href = safeHref(media.external_url);
  const caption = <span className="mt-1 block text-xs text-luxury-text/60 truncate">{media.label}</span>;

  if (media.kind === 'link' || media.kind === 'video') {
    const target = safeHref(url) ?? href;
    const Icon = media.kind === 'video' ? Video : Link2;
    return (
      <div>
        <a
          href={target ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!target}
          data-testid="media-link"
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-center text-sm hover:border-luxury-gold/40"
        >
          <Icon className="w-6 h-6 text-luxury-gold" aria-hidden />
          <span className="inline-flex items-center gap-1 text-luxury-text/70">
            {target ? 'Apri' : 'Non disponibile'} {target && <ExternalLink className="w-3.5 h-3.5" aria-hidden />}
          </span>
        </a>
        {caption}
      </div>
    );
  }

  if (!url || broken) {
    return (
      <div>
        <div
          data-testid="media-unavailable"
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-center text-xs text-luxury-text/60"
        >
          <ImageOff className="w-6 h-6" aria-hidden />
          Anteprima non disponibile
        </div>
        {caption}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ingrandisci: ${media.label}`}
        data-testid="gallery-thumb"
        className="block aspect-square w-full overflow-hidden rounded-xl border border-white/10 hover:border-luxury-gold/50 cursor-zoom-in"
      >
        <img src={url} alt={media.label} loading="lazy" onError={onError} className="h-full w-full object-cover" />
      </button>
      {caption}
    </div>
  );
}
