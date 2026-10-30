"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { SubmitQuoteDialog } from '@/components/dashboard/SubmitQuoteDialog';
import { QuoteCard } from '@/components/quotes/QuoteListClient';
import { SydLoader } from '@/components/ui/SydLoader';
import { useHouseQuote } from '@/hooks/use-house-quote';
import { useQuotes } from '@/hooks/use-quotes';
import { describeApiError } from '@/lib/api-client';
import { houseTabHref } from '@/lib/house-tabs';
import type { Quote, QuoteItem, QuoteListItem } from '@/types/quote';

const WITH_THE_TEAM = new Set(['pending_review', 'in_review']);

interface Section {
    id: string;
    label: string;
    items: QuoteItem[];
}

/** The lines of the quote by room, in the quote's order; lines of no listed room last. */
function sectionsOf(quote: Quote): Section[] {
    if (quote.rooms.length === 0) return [{ id: 'all', label: 'Lavorazioni', items: quote.items }];
    const listed = new Set(quote.rooms.map((room) => room.room_id));
    const sections = quote.rooms.map((room) => ({
        id: room.room_id,
        label: room.room_label,
        items: quote.items.filter((item) => item.room_id === room.room_id),
    }));
    const others = quote.items.filter((item) => !item.room_id || !listed.has(item.room_id));
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

function DraftSections({ quote }: { quote: Quote }) {
    return (
        <div className="space-y-4">
            {sectionsOf(quote).map((section) => (
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

/**
 * The quote of the house (Phase 139), by state: none yet → ask in the chat;
 * draft → the lines by room without prices (confidential until the team
 * approves) and "Invia al team"; with the team → its status; approved, sent or
 * declined → the card with total and PDF. A change always goes through the chat.
 */
export function HouseQuotePanel({ chatId }: { chatId: string }) {
    const router = useRouter();
    const { data: quote, isLoading, error } = useHouseQuote(chatId);
    const { data: quotes = [] } = useQuotes();
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
    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-serif font-bold text-luxury-text">Preventivo</h2>
                {quote.quote_number && (
                    <span className="text-xs font-medium tracking-wide text-luxury-gold/80 tabular-nums">{quote.quote_number}</span>
                )}
            </div>

            {isDraft && quote.items.length === 0 && (
                <p className="text-sm text-luxury-text/60">Il preventivo è in preparazione in chat.</p>
            )}

            {isDraft && quote.items.length > 0 && (
                <>
                    <DraftSections quote={quote} />
                    <p className="text-xs text-luxury-text/40">I prezzi arrivano con il preventivo approvato dal nostro team.</p>
                    <button
                        type="button"
                        onClick={() => setSubmitOpen(true)}
                        data-testid="submit-quote-button"
                        className="flex items-center justify-center gap-2 min-h-11 w-full touch-manipulation rounded-xl bg-luxury-gold/10 hover:bg-luxury-gold/20 border border-luxury-gold/30 hover:border-luxury-gold/50 text-luxury-gold text-xs font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/60"
                    >
                        <Send aria-hidden="true" className="w-4 h-4" />
                        Invia al team
                    </button>
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

            <p className="text-xs text-luxury-text/40">Per modificarlo scrivi in chat.</p>

            {/* Outside the draft: once sent, the quote read again is with the team,
                and the dialog must stay to confirm it. */}
            <SubmitQuoteDialog open={submitOpen} onOpenChange={setSubmitOpen} projectId={chatId} />
        </div>
    );
}
