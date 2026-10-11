'use client';

import Link from 'next/link';
import { CircleAlert, Loader2, RefreshCw } from 'lucide-react';

import { WeeklyBars } from '@/components/admin/dashboard/WeeklyBars';
import { formatDateTime, formatEuro } from '@/components/admin/quote-status';
import { useAdminKpis } from '@/hooks/admin/use-admin';
import type { AdminKpis } from '@/types/admin-content';

function Kpi({ label, value, hint, testId, href }: { label: string; value: string; hint?: string; testId: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-luxury-text/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-luxury-text/50">{hint}</p>}
    </>
  );
  const box = 'glass-premium rounded-2xl p-4 border border-white/5 block h-full';
  return (
    <li>
      {href ? (
        <Link href={href} className={`${box} hover:border-luxury-gold/30 transition-colors`}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

/** Counts shown on the cards; the other statuses are folded in like the old dashboard did. */
export function summarize(kpis: AdminKpis) {
  const by = kpis.by_status;
  const n = (key: string) => by[key] ?? 0;
  return {
    toWork: n('pending_review') + n('in_review'),
    approved: n('approved') + n('sent'),
    rejected: n('rejected'),
    drafts: n('draft'),
    sent: n('sent'),
  };
}

export function KpiDashboard() {
  const kpis = useAdminKpis();

  if (kpis.isPending) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" aria-label="Caricamento" />
      </div>
    );
  }
  if (kpis.isError) {
    return (
      <p role="alert" className="py-10 text-center text-sm text-red-400">
        Impossibile caricare i dati. Riprova tra poco.
      </p>
    );
  }

  const data = kpis.data;
  const s = summarize(data);
  return (
    <section className="space-y-6" aria-labelledby="dash-title" data-testid="kpi-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="dash-title" className="text-2xl font-semibold">
            Dashboard
          </h1>
          <p className="text-sm text-luxury-text/60">Aggiornata alle {formatDateTime(data.generated_at)}.</p>
        </div>
        <button
          type="button"
          onClick={() => void kpis.refetch()}
          disabled={kpis.isFetching}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${kpis.isFetching ? 'animate-spin' : ''}`} aria-hidden /> Aggiorna
        </button>
      </div>

      <ul aria-label="Indicatori" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Da lavorare" value={String(s.toWork)} hint="da revisionare o in revisione" testId="kpi-to-work" href="/admin/quotes" />
        <Kpi
          label="Valore in attesa"
          value={formatEuro(data.pending_value)}
          hint={data.pending_truncated ? 'somma parziale (oltre 500 preventivi)' : 'IVA inclusa'}
          testId="kpi-pending-value"
        />
        <Kpi label="Approvati" value={String(s.approved)} hint={`${s.sent} già inviati`} testId="kpi-approved" href="/admin/quotes" />
        <Kpi label="Rifiutati" value={String(s.rejected)} testId="kpi-rejected" />
        <Kpi
          label="Recensioni da moderare"
          value={String(data.testimonials.pending)}
          testId="kpi-reviews"
        />
      </ul>

      {s.drafts > 0 && (
        <p className="inline-flex items-center gap-2 text-sm text-luxury-text/60" data-testid="kpi-drafts">
          <CircleAlert className="w-4 h-4" aria-hidden /> {s.drafts} bozze non ancora inviate dai clienti.
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <section className="lg:col-span-2 glass-premium rounded-2xl p-4 border border-white/5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-3">
            Approvazioni settimanali (ultime 8 settimane)
          </h2>
          {data.weekly_approvals.every((w) => w.approvals === 0) ? (
            <p className="py-8 text-center text-sm text-luxury-text/60">
              Nessun preventivo approvato in queste settimane: il grafico apparirà qui.
            </p>
          ) : (
            <WeeklyBars weeks={data.weekly_approvals} />
          )}
        </section>

        <section className="glass-premium rounded-2xl p-4 border border-white/5" data-testid="recent-approvals">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-3">Ultimi approvati</h2>
          {data.recent_approvals.length === 0 ? (
            <p className="text-sm text-luxury-text/60">Nessun preventivo approvato.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.recent_approvals.map((r) => (
                <li key={r.project_id}>
                  <Link
                    href={`/admin/quotes/${encodeURIComponent(r.project_id)}`}
                    className="flex items-baseline justify-between gap-3 py-2 hover:text-luxury-gold"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium tabular-nums">{r.quote_number ?? 'Senza numero'}</span>
                      <span className="block text-xs text-luxury-text/60 truncate">{r.client_display_name ?? 'Cliente'}</span>
                    </span>
                    <span className="tabular-nums text-sm">{formatEuro(r.grand_total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass-premium rounded-2xl p-4 border border-white/5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-3">Stato delle recensioni</h2>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(
            [
              ['In attesa', data.testimonials.pending],
              ['Approvate', data.testimonials.approved],
              ['Rifiutate', data.testimonials.rejected],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-xs text-luxury-text/60">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
