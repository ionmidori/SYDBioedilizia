'use client';

import { useState } from 'react';
import { Check, Loader2, Star, X } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { formatDateTime } from '@/components/admin/quote-status';
import { useAdminTestimonials, useModerateTestimonial } from '@/hooks/admin/use-admin';
import { cn } from '@/lib/utils';
import type { AdminTestimonial, TestimonialStatus } from '@/types/admin-content';

const TABS: ReadonlyArray<{ id: TestimonialStatus; label: string }> = [
  { id: 'pending', label: 'In attesa' },
  { id: 'approved', label: 'Pubblicate' },
  { id: 'rejected', label: 'Rifiutate' },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} stelle su 5`} className="inline-flex gap-0.5 text-luxury-gold">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('w-4 h-4', n > rating && 'opacity-25')} fill={n <= rating ? 'currentColor' : 'none'} aria-hidden />
      ))}
    </span>
  );
}

/** Reviews left by visitors: nothing appears on the landing page until an admin publishes it. */
export function TestimonialModeration() {
  const [status, setStatus] = useState<TestimonialStatus>('pending');
  const list = useAdminTestimonials(status);
  const moderate = useModerateTestimonial();

  return (
    <section className="space-y-5" aria-labelledby="reviews-title" data-testid="testimonials">
      <div>
        <h1 id="reviews-title" className="text-2xl font-semibold">
          Recensioni
        </h1>
        <p className="text-sm text-luxury-text/60">Solo le recensioni pubblicate compaiono sul sito.</p>
      </div>

      <div role="tablist" aria-label="Stato delle recensioni" className="flex gap-1">
        {TABS.map((tab) => {
          const count = list.data?.stats[tab.id];
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={tab.id === status}
              onClick={() => {
                setStatus(tab.id);
                moderate.reset();
              }}
              data-testid={`tab-${tab.id}`}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap cursor-pointer border',
                tab.id === status ? 'bg-luxury-gold/15 border-luxury-gold/40 text-luxury-gold' : 'border-transparent text-luxury-text/70 hover:bg-white/5',
              )}
            >
              {tab.label}
              {count !== undefined && <span className="ml-1.5 tabular-nums text-xs opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      <ErrorBanner error={moderate.error} />

      {list.isPending ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
        </div>
      ) : list.isError ? (
        <p role="alert" className="py-10 text-center text-sm text-red-400">
          Impossibile caricare le recensioni. Riprova tra poco.
        </p>
      ) : list.data.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-luxury-text/60" data-testid="reviews-empty">
          {status === 'pending' ? 'Nessuna recensione in attesa di moderazione.' : 'Nessuna recensione in questa sezione.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.data.items.map((review) => (
            <ReviewCard key={review.id} review={review} pending={moderate.isPending && moderate.variables?.id === review.id} onModerate={(decision, notes) => moderate.mutate({ id: review.id, body: { decision, notes } })} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewCard({
  review,
  pending,
  onModerate,
}: {
  review: AdminTestimonial;
  pending: boolean;
  onModerate: (decision: 'approve' | 'reject', notes: string | null) => void;
}) {
  const [notes, setNotes] = useState('');
  const send = (decision: 'approve' | 'reject') => onModerate(decision, notes.trim() || null);

  return (
    <li className="glass-premium rounded-2xl p-4 border border-white/5 space-y-3" data-testid="review-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium" data-testid="review-name">
          {review.name}
        </span>
        {review.location && <span className="text-sm text-luxury-text/60">{review.location}</span>}
        <Stars rating={review.rating} />
        <span className="ml-auto text-xs text-luxury-text/50">{formatDateTime(review.created_at)}</span>
      </div>
      {/* Visitor-written text: rendered as plain text, never as markup. */}
      <p className="text-sm whitespace-pre-line" data-testid="review-text">
        {review.text}
      </p>
      {review.admin_notes && <p className="text-xs text-luxury-text/50">Nota interna: {review.admin_notes}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`notes-${review.id}`}>
          Nota interna (facoltativa)
        </label>
        <input
          id={`notes-${review.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Nota interna (facoltativa)"
          className="flex-1 min-w-[12rem] rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-luxury-gold/50"
        />
        {review.status !== 'approved' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send('approve')}
            data-testid="review-approve"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" aria-hidden /> Pubblica
          </button>
        )}
        {review.status !== 'rejected' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send('reject')}
            data-testid="review-reject"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-400/40 text-red-300 text-sm hover:bg-red-400/10 disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden /> {review.status === 'approved' ? 'Togli dal sito' : 'Rifiuta'}
          </button>
        )}
      </div>
    </li>
  );
}
