'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';

import { ErrorBanner } from '@/components/admin/dossier/ErrorBanner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGdprStatus, useRunGdprLifecycle } from '@/hooks/admin/use-admin';

/**
 * Account inactivity pipeline (GDPR). It runs by itself once a week; here an
 * admin can run it now. It really emails users, disables accounts and erases
 * personal data, so it asks for confirmation first.
 */
export function GdprMonitor() {
  const status = useGdprStatus();
  const run = useRunGdprLifecycle();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="space-y-5" aria-labelledby="gdpr-title" data-testid="gdpr">
      <div>
        <h1 id="gdpr-title" className="text-2xl font-semibold">
          GDPR
        </h1>
        <p className="text-sm text-luxury-text/60">
          Controllo automatico degli account inattivi. Parte da solo ogni domenica alle 03:00; qui puoi farlo partire subito.
        </p>
      </div>

      {status.isPending ? (
        <Loader2 className="w-5 h-5 animate-spin text-luxury-gold" aria-label="Caricamento" />
      ) : status.isError ? (
        <p role="alert" className="text-sm text-red-400">
          Impossibile caricare la configurazione.
        </p>
      ) : (
        <>
          <section className="glass-premium rounded-2xl p-4 border border-white/5" data-testid="gdpr-phases">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold mb-3">Fasi del ciclo di vita</h2>
            <ol className="space-y-2 text-sm">
              {status.data.phases.map((phase) => (
                <li key={phase.phase} className="flex gap-3">
                  <span className="font-semibold tabular-nums text-luxury-gold">Fase {phase.phase}</span>
                  <span className="tabular-nums text-luxury-text/60">{phase.months_inactive} mesi senza attività</span>
                  <span>{phase.action}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-luxury-text/60" data-testid="gdpr-scheduler">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
              {status.data.scheduler_secret_configured
                ? 'Il job automatico è configurato.'
                : 'Il job automatico NON è configurato (manca il segreto sul server).'}
            </p>
          </section>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                run.reset();
                setConfirmOpen(true);
              }}
              disabled={run.isPending}
              data-testid="gdpr-run"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium disabled:opacity-50 cursor-pointer"
            >
              {run.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              Esegui ora
            </button>
            {run.isPending && <p className="text-sm text-luxury-text/60">In corso: può richiedere fino a un minuto. Non chiudere la pagina.</p>}
            <ErrorBanner error={run.error} />
          </div>

          {run.data && (
            <section className="glass-premium rounded-2xl p-4 border border-white/5 space-y-3" data-testid="gdpr-result">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-luxury-gold">Risultato</h2>
              <p className={run.data.status === 'ok' ? 'text-sm text-emerald-400' : 'text-sm text-amber-400'}>
                {run.data.status === 'ok' ? 'Completato senza errori.' : 'Completato con errori parziali.'}
              </p>
              <dl className="grid grid-cols-3 gap-3 text-center">
                {(
                  [
                    ['Avvisati (fase 1)', run.data.warned],
                    ['Disabilitati (fase 2)', run.data.disabled],
                    ['Anonimizzati (fase 3)', run.data.anonymized],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex flex-col-reverse rounded-xl border border-white/10 py-2">
                    <dt className="text-xs text-luxury-text/60">{label}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {run.data.errors.length > 0 && (
                <ul className="space-y-1 text-sm text-amber-300" data-testid="gdpr-errors">
                  {run.data.errors.map((message) => (
                    <li key={message} className="flex items-center gap-2">
                      <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden /> {message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md bg-luxury-bg border-luxury-gold/20 text-luxury-text">
          <DialogHeader>
            <DialogTitle>Eseguire il controllo ora?</DialogTitle>
            <DialogDescription>
              Gli utenti inattivi riceveranno l&apos;email di avviso, gli account oltre la soglia saranno disabilitati e i dati
              personali dopo 24 mesi saranno anonimizzati. L&apos;anonimizzazione non si può annullare.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} className="px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 cursor-pointer">
              Annulla
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                run.mutate();
              }}
              data-testid="gdpr-confirm"
              className="px-4 py-2 rounded-xl bg-luxury-gold text-black text-sm font-medium cursor-pointer"
            >
              Esegui
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
