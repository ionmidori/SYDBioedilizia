'use client';

import { useState } from 'react';
import { useConfirmationMutation, useConfirmations } from '@/hooks/use-confirmations';
import { describeApiError } from '@/lib/api-client';
import type { ConfirmationUpdate, SectionState } from '@/types/confirmation';
import { ConfirmationSection } from './ConfirmationSection';
import { ConfirmedSection } from './ConfirmedSection';

/** Changes when what the section shows changes: the section starts again from the server values. */
function sectionSignature(section: SectionState): string {
  const measures = section.measures.map((m) => `${m.name}=${m.value}/${m.proposed}`);
  const choices = section.element_choices.map((c) => `${c.element}=${c.action}/${c.confirmed}`);
  return [section.section_key, ...measures, ...choices].join('|');
}

/** A confirmed section is worth showing only if there is something in it to change. */
const hasContent = (section: SectionState) => section.measures.length + section.element_choices.length > 0;

/**
 * The card where a signed-in client confirms the measures and the works of the request
 * (Phase 140, step 3). It reads and writes by itself: the chat draws it under the agent's
 * reply, the client area can draw it too. Never an amount: only the precision of the estimate.
 * A section already confirmed stays on the card, closed, with "Modifica" while the quote is a draft.
 * Nothing when there is nothing to confirm or change, or when the state cannot be read (a guest gets 403).
 */
export function ConfirmationCard({ projectId }: { projectId: string }) {
  const { data } = useConfirmations(projectId);
  const mutation = useConfirmationMutation(projectId);
  // The confirmed section the client opened to change (one at a time).
  const [editing, setEditing] = useState<string | null>(null);
  // The section just closed: its "Modifica" gets the focus back.
  const [closed, setClosed] = useState<string | null>(null);

  if (!data) return null;
  // Once the quote is with the team nothing can be changed here: only what is still pending is shown.
  const shown = data.sections.filter((section) => section.pending || (data.editable && hasContent(section)));
  const pending = shown.filter((section) => section.pending);
  // A key left over from a section that is gone must not reopen it when it comes back.
  const open = shown.some((section) => section.section_key === editing) ? editing : null;
  // Nothing to confirm or change: the card stays only to say how precise the estimate is.
  if (shown.length === 0 && !(mutation.isSuccess && data.precision !== null)) return null;

  const close = (key: string) => {
    setEditing((current) => (current === key ? null : current));
    setClosed(key);
  };
  const cancel = (key: string) => {
    // The error of a failed save belongs to the section just closed.
    mutation.reset();
    close(key);
  };
  const edit = (key: string) => {
    setClosed(null);
    setEditing(key);
  };

  const confirm = (section: SectionState, update: ConfirmationUpdate) =>
    mutation.mutate(
      { sectionKey: section.section_key, update },
      { onSuccess: () => close(section.section_key) },
    );

  return (
    <section
      aria-label="Conferma misure e lavori"
      data-testid="confirmation-card"
      className="not-prose w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface-muted p-4 shadow-1"
    >
      <p className="text-sm font-semibold text-ink">Conferma misure e lavori</p>
      {shown.map((section) =>
        section.pending || open === section.section_key ? (
          <ConfirmationSection
            key={sectionSignature(section)}
            section={section}
            editable={data.editable}
            saving={mutation.isPending && mutation.variables?.sectionKey === section.section_key}
            locked={mutation.isPending}
            onConfirm={(update) => confirm(section, update)}
            onCancel={section.pending ? undefined : () => cancel(section.section_key)}
          />
        ) : (
          <ConfirmedSection
            key={section.section_key}
            section={section}
            // One section at a time: opening another would throw away what was typed.
            disabled={mutation.isPending || open !== null}
            restoreFocus={closed === section.section_key}
            onEdit={() => edit(section.section_key)}
          />
        ),
      )}
      {!data.editable && pending.length > 0 && (
        <p className="text-xs text-ink-muted">Per cambiare qualcosa scrivi in chat.</p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-danger-ink">
          {describeApiError(mutation.error)}
        </p>
      )}
      {data.precision !== null && (
        <p role="status" className="text-sm font-medium text-success-ink">
          Stima precisa al {data.precision} %
        </p>
      )}
    </section>
  );
}
