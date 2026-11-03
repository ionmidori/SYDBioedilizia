"use client";

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, Loader2, MessageSquare, Send, XCircle } from 'lucide-react';
import { SubmitQuoteDialog } from '@/components/dashboard/SubmitQuoteDialog';
import { QuoteCard, formatDate, formatEuro } from '@/components/quotes/QuoteListClient';
import { SydLoader } from '@/components/ui/SydLoader';
import { useHouseQuote, useQuoteHistory } from '@/hooks/use-house-quote';
import { useQuotes } from '@/hooks/use-quotes';
import { describeApiError } from '@/lib/api-client';
import { houseTabHref } from '@/lib/house-tabs';
import { logger } from '@/lib/logger';
import { quotesApi } from '@/lib/quotes-api';
import type { Quote, QuoteHistoryItem, QuoteItem, QuoteListItem, QuoteRoom, RevisionInProgress } from '@/types/quote';

const WITH_THE_TEAM = new Set(['pending_review', 'in_review']);

interface Section {
    id: string;
    label: string;
    items: QuoteItem[];
}

interface Lines {
    items: QuoteItem[];
    rooms: QuoteRoom[];
}

/** The lines by room, in the quote's order; lines of no listed room last. */
function sectionsOf({ items, rooms }: Lines): Section[] {
    if (rooms.length === 0) return [{ id: 'all', label: 'Lavorazioni', items }];
    const listed = new Set(rooms.map((room) => room.room_id));
    const sections = rooms.map((room) => ({
        id: room.room_id,
        label: room.room_label,
        items: items.filter((item) => item.room_id === room.room_id),
    }));
    const others = items.filter((item) => !item.room_id || !listed.has(item.room_id));
    if (others.length > 0) sections.push({ id: 'others', label: 'Altre lavorazioni', items: others });
    return sections.filter((section) => section.items.length > 0);
}

/** What the list of the user's quotes says of this one, else what the quote itself says. */
function listItemOf(quote: Quote, listed: QuoteListItem | undefined): QuoteListItem {
    return listed ?? {
        project_id: quote.project_id,
        project_name: '',
        quote_number: quote.quote_number,
        status: quote.status,
        grand_total: quote.financials.grand_total ?? 0,
        item_count: quote.items.length,
        updated_at: quote.updated_at ?? '',
        pdf_available: false,
    };
}

function DraftSections({ lines }: { lines: Lines }) {
    return (
        <div className="space-y-4">
            {sectionsOf(lines).map((section) => (
                <section key={section.id} aria-label={section.label} className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-luxury-gold/70">{section.label}</h3>
                    <ul className="space-y-1.5">
                        {section.items.map((item, index) => (
                            <li key={`${item.sku}-${index}`} className="flex items-baseline justify-between gap-3 text-sm text-luxury-text/80">
                                <span className="min-w-0">{item.description}</span>
                                <span className="shrink-0 tabular-nums text-xs text-luxury-text/50">
                                    {item.qty} {item.unit}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}

function SendToTeamButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid="submit-quote-button"
            className="flex items-center justify-center gap-2 min-h-11 w-full touch-manipulation rounded-xl bg-luxury-gold/10 hover:bg-luxury-gold/20 border border-luxury-gold/30 hover:border-luxury-gold/50 text-luxury-gold text-xs font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/60"
        >
            <Send aria-hidden="true" className="w-4 h-4" />
            Invia al team
        </button>
    );
}

/** The next revision of the quote the client received: what they asked, without prices. */
function RevisionBox({ revision, onSubmit }: { revision: RevisionInProgress; onSubmit: () => void }) {
    return (
        <section
            aria-label="Nuova revisione"
            data-testid="quote-revision"
            data-revision-state={revision.state}
            className="space-y-4 p-4 rounded-2xl border border-luxury-gold/20 bg-luxury-gold/5"
        >
            <h3 className="text-sm font-bold text-luxury-text">Nuova revisione</h3>
            {revision.state === 'with_team' && (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-300/90">
                    <CheckCircle2 aria-hidden="true" className="w-4 h-4" />
                    Inviata al team, in revisione
                </p>
            )}
            {revision.state === 'rejected' && (
                <p className="flex items-center gap-2 text-sm text-red-300/90">
                    <XCircle aria-hidden="true" className="w-4 h-4" />
                    Il team non ha accolto queste modifiche: scrivi in chat per prepararne altre.
                </p>
            )}
            {/* Lines only in the draft: once the team has it, it may be editing them. */}
            {revision.items.length > 0 && <DraftSections lines={revision} />}
            <p className="text-xs text-luxury-text/40">
                Il preventivo che hai ricevuto resta valido finché il team non ti invia quello aggiornato.
            </p>
            {revision.state === 'draft' && <SendToTeamButton onClick={onSubmit} />}
        </section>
    );
}

/** The PDF of a revision the client received, opened in a new tab. */
function OlderRevision({ chatId, entry }: { chatId: string; entry: QuoteHistoryItem }) {
    const [downloading, setDownloading] = useState(false);
    const [failed, setFailed] = useState(false);

    const download = useCallback(async () => {
        setDownloading(true);
        setFailed(false);
        try {
            const { pdf_url } = await quotesApi.getQuotePdfUrl(chatId, entry.revision);
            window.open(pdf_url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            logger.error('[Quotes] Revision PDF download failed', error);
            setFailed(true);
        } finally {
            setDownloading(false);
        }
    }, [chatId, entry.revision]);

    return (
        <li className="flex items-center justify-between gap-3 text-sm text-luxury-text/70">
            <span className="min-w-0">
                Rev. {entry.revision} · {formatDate(entry.sent_at)}
                {entry.grand_total > 0 && <> · {formatEuro(entry.grand_total)}</>}
                {failed && <span className="block text-xs text-red-400">PDF non disponibile al momento.</span>}
            </span>
            {entry.pdf_available && (
                <button
                    type="button"
                    onClick={download}
                    disabled={downloading}
                    aria-label={`Scarica il PDF della revisione ${entry.revision}`}
                    className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl text-luxury-gold hover:bg-luxury-gold/10 disabled:opacity-50 touch-manipulation"
                >
                    {downloading ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Download aria-hidden="true" className="w-4 h-4" />}
                </button>
            )}
        </li>
    );
}

/**
 * The quote of the house (Phase 139), by state: none yet → ask in the chat;
 * draft → the lines by room without prices (confidential until the team
 * approves) and "Invia al team"; with the team → its status; approved, sent or
 * declined → the card with total and PDF. Once a quote was sent, a new request
 * in the chat opens its next revision (Phase 139 PR-3): shown above the quote
 * received, which stays valid, with the older revisions below. A change always
 * goes through the chat.
 */
export function HouseQuotePanel({ chatId }: { chatId: string }) {
    const router = useRouter();
    const { data: quote, isLoading, error } = useHouseQuote(chatId);
    const { data: quotes = [] } = useQuotes();
    // Only a quote that was sent has revisions to show; a failed read hides them, not the quote.
    const { data: history } = useQuoteHistory(chatId, Boolean(quote?.sent_at));
    const [submitOpen, setSubmitOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[30vh]">
                <SydLoader size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <p role="alert" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
                {describeApiError(error)}
            </p>
        );
    }

    if (!quote) {
        return (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
                <p className="text-sm text-luxury-text/60 max-w-xs">
                    Ancora nessun preventivo. Racconta in chat i lavori che vuoi fare: SYD lo prepara stanza per stanza.
                </p>
                {/* On desktop the chat is already beside the panel. */}
                <button
                    type="button"
                    onClick={() => router.replace(houseTabHref('chat'), { scroll: false })}
                    className="md:hidden flex items-center gap-2 min-h-11 px-5 rounded-xl bg-luxury-gold text-luxury-bg text-sm font-bold hover:bg-luxury-gold/90 touch-manipulation"
                >
                    <MessageSquare aria-hidden="true" className="w-4 h-4" />
                    Chiedilo in chat
                </button>
            </div>
        );
    }

    const isDraft = quote.status === 'draft';
    // The newest revision received is the card itself.
    const older = history?.sent.slice(1) ?? [];
    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-serif font-bold text-luxury-text">Preventivo</h2>
                {quote.quote_number && (
                    <span className="text-xs font-medium tracking-wide text-luxury-gold/80 tabular-nums">{quote.quote_number}</span>
                )}
            </div>

            {history?.in_progress && (
                <RevisionBox revision={history.in_progress} onSubmit={() => setSubmitOpen(true)} />
            )}

            {isDraft && quote.items.length === 0 && (
                <p className="text-sm text-luxury-text/60">Il preventivo è in preparazione in chat.</p>
            )}

            {isDraft && quote.items.length > 0 && (
                <>
                    <DraftSections lines={quote} />
                    <p className="text-xs text-luxury-text/40">I prezzi arrivano con il preventivo approvato dal nostro team.</p>
                    <SendToTeamButton onClick={() => setSubmitOpen(true)} />
                </>
            )}

            {WITH_THE_TEAM.has(quote.status) && (
                <p data-testid="quote-with-team" className="flex items-center gap-2 text-sm font-medium text-emerald-300/90">
                    <CheckCircle2 aria-hidden="true" className="w-4 h-4" />
                    Inviato al team, in revisione
                </p>
            )}

            {!isDraft && !WITH_THE_TEAM.has(quote.status) && (
                <QuoteCard quote={listItemOf(quote, quotes.find((q) => q.project_id === chatId))} />
            )}

            {older.length > 0 && (
                <section aria-label="Revisioni precedenti" className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-luxury-gold/70">Revisioni precedenti</h3>
                    <ul className="divide-y divide-luxury-gold/10">
                        {older.map((entry) => (
                            <OlderRevision key={entry.revision} chatId={chatId} entry={entry} />
                        ))}
                    </ul>
                </section>
            )}

            <p className="text-xs text-luxury-text/40">Per modificarlo scrivi in chat.</p>

            {/* Outside the draft: once sent, the quote read again is with the team,
                and the dialog must stay to confirm it. */}
            <SubmitQuoteDialog open={submitOpen} onOpenChange={setSubmitOpen} projectId={chatId} />
        </div>
    );
}
