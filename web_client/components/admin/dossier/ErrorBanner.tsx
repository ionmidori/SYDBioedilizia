'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

import { type AdminErrorInfo, describeAdminError } from '@/lib/admin/admin-errors';

/** Failure of an admin action; offers a reload when the dossier is stale. */
export function ErrorBanner({
  error,
  onReload,
  describe = describeAdminError,
}: {
  error: unknown;
  onReload?: () => void;
  /** Overrides the wording for a specific kind of call (e.g. file uploads). */
  describe?: (error: unknown) => AdminErrorInfo;
}) {
  if (!error) return null;
  const info = describe(error);
  return (
    <div
      role="alert"
      data-testid="error-banner"
      data-error-kind={info.kind}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
      <span className="flex-1 min-w-[12rem]">{info.message}</span>
      {info.stale && onReload && (
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300/40 hover:bg-red-300/10 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Ricarica
        </button>
      )}
    </div>
  );
}
