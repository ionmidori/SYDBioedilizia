'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGuestClaim } from '@/hooks/use-guest-claim';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';

/**
 * A guest claim that failed after login (lib/auth/guest-claim.ts): stays on
 * screen until the user closes it, with "Riprova" when trying again can help.
 */
export function GuestClaimNotice() {
    const claim = useGuestClaim();
    if (claim.status !== 'error') return null;
    const { message, retry } = claim;

    return (
        <div
            role="alert"
            className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[210] mx-auto max-w-md rounded-2xl border border-amber-400/30 bg-slate-900/95 p-4 shadow-xl md:left-auto md:right-6 md:mx-0"
        >
            <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
                <div className="flex-1 space-y-3">
                    <p className="text-sm font-semibold text-slate-100">Conversazioni da ospite non recuperate</p>
                    <p className="text-xs leading-relaxed text-slate-300">{message}</p>
                    <div className="flex gap-2">
                        {retry && (
                            <Button size="sm" onClick={() => void retry()}>
                                Riprova
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-slate-300" onClick={guestClaimStore.reset}>
                            Chiudi
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
