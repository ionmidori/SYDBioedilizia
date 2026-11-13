'use client';

import { useConfirmationMutation, useConfirmations } from '@/hooks/use-confirmations';
import { describeApiError } from '@/lib/api-client';
import type { SectionState } from '@/types/confirmation';
import { ConfirmationSection } from './ConfirmationSection';

/** Changes when what the section shows changes: the section starts again from the server values. */
function sectionSignature(section: SectionState): string {
  const measures = section.measures.map((m) => `${m.name}=${m.value}/${m.proposed}`);
  const choices = section.element_choices.map((c) => `${c.element}=${c.action}/${c.confirmed}`);
  return [section.section_key, ...measures, ...choices].join('|');
}

/**
 * The card where a signed-in client confirms the measures and the works of the request
 * (Phase 140, step 3). It reads and writes by itself: the chat draws it under the agent's
 * reply, the client area can draw it too. Never an amount: only the precision of the estimate.
 * Nothing when no section is pending, or when the state cannot be read (a guest gets 403).
 */
export function ConfirmationCard({ projectId }: { projectId: string }) {
  const { data } = useConfirmations(projectId);
  const mutation = useConfirmationMutation(projectId);

  if (!data) return null;
  const pending = data.sections.filter((section) => section.pending);
  if (pending.length === 0 && !mutation.isSuccess) return null;

  return (
    <section
      aria-label="Conferma misure e lavori"
      data-testid="confirmation-card"
      className="not-prose w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface-muted p-4 shadow-1"
    >
      <p className="text-sm font-semibold text-ink">Conferma misure e lavori</p>
      {pending.map((section) => (
        <ConfirmationSection
          key={sectionSignature(section)}
          section={section}
          editable={data.editable}
          saving={mutation.isPending && mutation.variables?.sectionKey === section.section_key}
          onConfirm={(update) => mutation.mutate({ sectionKey: section.section_key, update })}
        />
      ))}
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
