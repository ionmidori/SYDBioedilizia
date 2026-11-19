'use client';

import { type ReactNode, useState } from 'react';
import { ChevronDown, Image as ImageIcon, Loader2, MessageSquare } from 'lucide-react';

import { formatDateTime } from '@/components/admin/quote-status';
import { Button } from '@/components/ui/button';
import { useAdminChat } from '@/hooks/admin/use-admin';
import { cn } from '@/lib/utils';
import type { AdminChatMessage } from '@/types/admin-quote';

function ChatMessage({ message }: { message: AdminChatMessage }) {
  const client = message.role === 'user';
  return (
    <li
      className={cn(
        'rounded-xl px-3 py-2 text-sm space-y-1 border border-line',
        client ? 'bg-surface-muted mr-8' : 'bg-surface ml-8',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span className="font-semibold text-ink">{client ? 'Cliente' : 'SYD'}</span>
        {message.at && <time dateTime={message.at}>{formatDateTime(message.at)}</time>}
        {message.room_label && (
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-ink">{message.room_label}</span>
        )}
        {message.has_media && (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" aria-hidden />
            Foto allegate
          </span>
        )}
      </div>
      {message.text && <p className="whitespace-pre-wrap break-words text-ink">{message.text}</p>}
    </li>
  );
}

function MessageList({ messages }: { messages: AdminChatMessage[] }) {
  return (
    <ol className="space-y-2">
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </ol>
  );
}

/**
 * The client chat (relay plan, PR 5): what the client asked SYD, read before
 * approving. The change the team has to read comes first; the chat before it
 * stays collapsed. The follow-up banner links here (`#chat-cliente`).
 */
export function DossierChat({ projectId }: { projectId: string }) {
  const chat = useAdminChat(projectId);
  const [showOlder, setShowOlder] = useState(false);

  let body: ReactNode;
  // Data first: a failed background refresh keeps the chat already read.
  if (chat.data) {
    const { messages, change_kind: kind, change_since: since, truncated } = chat.data;
    const changed = messages.filter((message) => message.in_change);
    const older = messages.filter((message) => !message.in_change);
    body = (
      <>
        {truncated && (
          <p className="text-xs text-ink-muted" data-testid="chat-truncated">
            Sono mostrati solo i messaggi più recenti.
          </p>
        )}
        {kind && !since && (
          <p className="text-xs text-ink-muted" data-testid="chat-change-unknown">
            Non si sa da quando parte la modifica: leggi tutta la chat.
          </p>
        )}
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessun messaggio in chat.</p>
        ) : changed.length === 0 ? (
          <MessageList messages={messages} />
        ) : (
          <>
            <div className="rounded-xl border border-info/30 bg-info-subtle p-3 space-y-2" data-testid="chat-change">
              <h3 className="text-sm font-semibold text-info-ink">Modifica richiesta dal {formatDateTime(since)}</h3>
              <MessageList messages={changed} />
            </div>
            {older.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  aria-expanded={showOlder}
                  onClick={() => setShowOlder((open) => !open)}
                  className="flex items-center gap-1.5 rounded-lg text-sm text-primary-ink hover:underline cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showOlder && 'rotate-180')} aria-hidden />
                  {showOlder ? 'Nascondi' : 'Mostra'} la chat precedente (
                  {older.length === 1 ? '1 messaggio' : `${older.length} messaggi`})
                </button>
                {showOlder && <MessageList messages={older} />}
              </div>
            )}
          </>
        )}
      </>
    );
  } else if (chat.isError) {
    body = (
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span>Non è stato possibile leggere la chat.</span>
        <Button size="sm" variant="secondary" onClick={() => void chat.refetch()}>
          Riprova
        </Button>
      </div>
    );
  } else {
    body = (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Caricamento della chat…
      </p>
    );
  }

  return (
    <section
      id="chat-cliente"
      className="bg-surface shadow-1 rounded-2xl p-4 border border-line space-y-3 scroll-mt-4"
      aria-labelledby="chat-cliente-title"
      data-testid="dossier-chat"
    >
      <h2 id="chat-cliente-title" className="flex items-center gap-2 text-sm font-semibold text-primary-ink">
        <MessageSquare className="w-4 h-4" aria-hidden />
        Chat del cliente
      </h2>
      {body}
    </section>
  );
}
