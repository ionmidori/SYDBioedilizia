"use client"

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Loader2, Clock, CheckCircle2, XCircle, Mail } from 'lucide-react';

import { ScallopedInlineLoader } from '@/components/ui/ScallopedPageTransition';
import { useQuotes } from '@/hooks/use-quotes';
import { quotesApi } from '@/lib/quotes-api';
import { QuoteListItem } from '@/types/quote';
import { logger } from '@/lib/logger';

/**
 * Client area "Preventivi" section.
 *
 * Shows the user's quote REQUESTS and their review status. The draft contents
 * (items/prices) are confidential until the admin approves: the backend masks
 * grand_total and denies the PDF for non-approved quotes, so this list only
 * reveals totals + PDF download once a quote is approved.
 */

const STATUS_UI: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
    pending_review: { label: 'In revisione', className: 'text-amber-400 bg-amber-400/10 border-amber-400/20', Icon: Clock },
    approved: { label: 'Approvato', className: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', Icon: CheckCircle2 },
    sent: { label: 'Inviato', className: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', Icon: Mail },
    rejected: { label: 'Non approvato', className: 'text-red-400 bg-red-400/10 border-red-400/20', Icon: XCircle },
};

function formatDate(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatEuro(value: number): string {
    return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function QuoteCard({ quote }: { quote: QuoteListItem }) {
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const status = STATUS_UI[quote.status];
    const isApproved = quote.status === 'approved' || quote.status === 'sent';

    const handleDownload = useCallback(async () => {
        setDownloading(true);
        setDownloadError(null);
        try {
            const { pdf_url } = await quotesApi.getQuotePdfUrl(quote.project_id);
            window.open(pdf_url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            logger.error('[Quotes] PDF download failed', error);
            setDownloadError('PDF non disponibile al momento. Riprova tra poco.');
        } finally {
            setDownloading(false);
        }
    }, [quote.project_id]);

    if (!status) return null; // unknown status (e.g. draft) — never shown to the client

    const { label, className, Icon } = status;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl glass-premium border border-luxury-gold/10 hover:border-luxury-gold/25 transition-colors space-y-4"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-semibold text-luxury-text truncate">
                        {quote.project_name || 'Progetto senza nome'}
                    </h3>
                    <p className="text-xs text-luxury-text/50 mt-1">
                        {quote.item_count} lavorazioni
                        {quote.updated_at && <> · aggiornato {formatDate(quote.updated_at)}</>}
                    </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium shrink-0 ${className}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                </span>
            </div>

            {isApproved ? (
                <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-lg font-bold text-luxury-gold">
                        {quote.grand_total > 0 ? formatEuro(quote.grand_total) : ''}
                        {quote.grand_total > 0 && (
                            <span className="text-[10px] font-normal text-luxury-text/40 ml-1.5">IVA inclusa</span>
                        )}
                    </p>
                    {quote.pdf_available && (
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-luxury-gold/10 hover:bg-luxury-gold/20 border border-luxury-gold/30 text-luxury-gold text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Scarica PDF
                        </button>
                    )}
                </div>
            ) : (
                <p className="text-xs text-luxury-text/40">
                    {quote.status === 'rejected'
                        ? 'Il team ti contatterà per un preventivo personalizzato.'
                        : 'Il nostro team sta esaminando la richiesta: riceverai il preventivo via email e lo troverai qui appena approvato.'}
                </p>
            )}

            {downloadError && (
                <p className="text-xs text-red-400">{downloadError}</p>
            )}
        </motion.div>
    );
}

export function QuoteListClient() {
    const { data: quotes = [], isLoading, isError } = useQuotes();

    // The client never sees drafts: only submitted requests and their outcome.
    const visibleQuotes = useMemo(
        () => quotes.filter((q) => q.status !== 'draft'),
        [quotes]
    );

    if (isLoading) {
        return <ScallopedInlineLoader />;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-10 py-6 px-4 md:px-8">
            {/* Header */}
            <div className="space-y-3 border-b border-luxury-gold/10 pb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-luxury-text font-serif flex items-center gap-4">
                    <div className="p-2 md:p-3 bg-luxury-gold/10 rounded-xl md:rounded-2xl border border-luxury-gold/20 shadow-lg shadow-luxury-gold/5 shrink-0">
                        <FileText className="w-6 h-6 md:w-8 md:h-8 text-luxury-gold" />
                    </div>
                    I Miei <span className="text-luxury-gold italic">Preventivi</span>
                </h1>
                <p className="text-luxury-text/50 max-w-xl font-medium text-xs md:text-sm leading-relaxed">
                    Le tue richieste di preventivo e i documenti approvati dal nostro team.
                </p>
            </div>

            {isError && (
                <p className="text-sm text-red-400">
                    Errore nel caricamento dei preventivi. Riprova tra poco.
                </p>
            )}

            {!isError && visibleQuotes.length === 0 && (
                <div className="text-center py-16 space-y-3">
                    <FileText className="w-10 h-10 text-luxury-text/20 mx-auto" />
                    <p className="text-luxury-text/50 text-sm">
                        Nessuna richiesta di preventivo ancora inviata.
                    </p>
                    <p className="text-luxury-text/35 text-xs max-w-md mx-auto">
                        Completa un preventivo in chat oppure seleziona i progetti dalla
                        pagina Progetti e invia la richiesta al team.
                    </p>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {visibleQuotes.map((quote) => (
                    <QuoteCard key={quote.project_id} quote={quote} />
                ))}
            </div>
        </div>
    );
}
