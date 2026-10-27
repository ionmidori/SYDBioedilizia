'use client';

import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { ResponsiveDrawer } from '@/components/ui/responsive-drawer';
import { Button } from '@/components/ui/button';
import { SydLoader } from '@/components/ui/SydLoader';
import { useSubmitQuote } from '@/hooks/use-submit-quote';
import { describeApiError } from '@/lib/api-client';

interface SubmitQuoteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    projectTitle: string;
}

// The backend messages are for developers: the client reads these.
const ERROR_MESSAGES: Record<string, string> = {
    QUOTE_EMPTY: 'Il preventivo non ha ancora lavorazioni: completalo in chat prima di inviarlo.',
    QUOTE_NOT_FOUND: 'Questo progetto non ha ancora un preventivo: preparalo in chat.',
    INVALID_TRANSITION: 'Il preventivo non può essere inviato nello stato attuale (per esempio è stato chiuso dal nostro team). Scrivici e lo verifichiamo.',
    PERMISSION_DENIED: 'Accedi con il tuo account per inviare la richiesta.',
};

function submitErrorMessage(error: unknown): string {
    const body = error as { error_code?: unknown; error?: unknown } | null;
    const code = body?.error_code;
    if (typeof code === 'string' && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    // slowapi's 429 body: {"error": "Rate limit exceeded: …"}, no error_code.
    if (typeof body?.error === 'string' && body.error.startsWith('Rate limit')) {
        return 'Troppi tentativi ravvicinati. Riprova tra qualche minuto.';
    }
    if (code === 'APP_CHECK_FAILED') return describeApiError(error);
    return 'Invio non riuscito. Controlla la connessione e riprova.';
}

/**
 * "Invia al team" — explicit confirmation before the project's quote goes to
 * the team (same path as the chat tool submit_quote_request). The body is
 * mounted only while open: each opening gets its own Idempotency-Key, reused
 * by a retry after an error, so a double click never sends two emails.
 */
export function SubmitQuoteDialog({ open, onOpenChange, projectId, projectTitle }: SubmitQuoteDialogProps) {
    return (
        <ResponsiveDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="Invia al team"
            description={`Richiesta di preventivo per “${projectTitle}”`}
            className="sm:max-w-[500px] bg-slate-900 border-slate-800"
        >
            {open && <SubmitQuoteBody projectId={projectId} onClose={() => onOpenChange(false)} />}
        </ResponsiveDrawer>
    );
}

function SubmitQuoteBody({ projectId, onClose }: { projectId: string; onClose: () => void }) {
    const [idempotencyKey] = useState(() => crypto.randomUUID());
    const submit = useSubmitQuote();

    const handleSubmit = () => {
        submit.mutate({ projectId, idempotencyKey });
    };

    if (submit.isSuccess) {
        return (
            <div
                className="space-y-4 py-2"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div role="status" className="flex items-start gap-3">
                    <CheckCircle2 aria-hidden="true" className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300">
                        {/* duplicate: a retry of this same click, or the quote was already sent from the chat */}
                        {submit.data.duplicate
                            ? 'La richiesta è con il nostro team: la sta esaminando e riceverai il preventivo finale via email.'
                            : 'Richiesta inviata. Il nostro team la esamina e riceverai il preventivo finale via email.'}
                    </p>
                </div>
                <div className="flex justify-end pt-2">
                    <Button type="button" onClick={onClose} className="bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg">
                        Chiudi
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="space-y-4 py-2"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <p className="text-sm text-slate-400">
                Il team esamina tutte le stanze del preventivo, definisce voci e prezzi e ti invia il
                preventivo finale via email. Dopo l&apos;invio, per aggiungere o cambiare qualcosa
                scrivilo in chat: lo riportiamo al team.
            </p>

            {submit.isError && (
                <p role="alert" className="text-sm text-red-400">
                    {submitErrorMessage(submit.error)}
                </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onClose}
                    disabled={submit.isPending}
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                >
                    Annulla
                </Button>
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submit.isPending}
                    className="bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-bg font-bold flex items-center gap-2"
                >
                    {submit.isPending ? (
                        <>
                            <SydLoader size="sm" />
                            Invio in corso…
                        </>
                    ) : (
                        <>
                            <Send aria-hidden="true" className="w-4 h-4" />
                            Invia al team
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
