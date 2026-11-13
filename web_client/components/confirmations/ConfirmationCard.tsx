'use client';

import { useState } from 'react';
import { useConfirmationMutation, useConfirmations } from '@/hooks/use-confirmations';
import { describeApiError } from '@/lib/api-client';
import type { ConfirmationUpdate, SectionState } from '@/types/confirmation';
import { ConfirmationSection } from './ConfirmationSection';
import { voiceConfirmed } from './pending';

/** Changes when what the section shows changes: the section starts again from the server values. */
function sectionSignature(section: SectionState): string {
  const measures = section.measures.map((m) => `${m.name}=${m.value}/${m.proposed}/${m.source}`);
  const choices = section.element_choices.map((c) => `${c.element}=${c.action}/${c.confirmed}`);
  return [section.section_key, ...measures, ...choices].join('|');
}

/** A confirmed section is worth showing only if there is something in it to change. */
const hasContent = (section: SectionState) => section.measures.length + section.element_choices.length > 0;

/** The confirmed voice the client opened to change (one at a time, in the whole card). */
interface VoiceRef {
  section: string;
  voice: string;
}

/**
 * The card where a signed-in client confirms the measures and the works of the request
 * (Phase 140, step 3). It reads and writes by itself: the chat draws it under the agent's
 * reply, the client area can draw it too. Never an amount: only the precision of the estimate.
 * What is still to confirm is asked all together under one "Conferma". What is already confirmed
 * stays on the card as a summary, each voice with its own "Modifica" while the quote is a draft:
 * it opens only that voice. Nothing when there is nothing to confirm or change, or when the
 * state cannot be read (a guest gets 403).
 */
export function ConfirmationCard({ projectId }: { projectId: string }) {
  const { data } = useConfirmations(projectId);
  const mutation = useConfirmationMutation(projectId);
  const [editing, setEditing] = useState<VoiceRef | null>(null);
  // The voice just closed: its "Modifica" gets the focus back.
  const [closed, setClosed] = useState<VoiceRef | null>(null);

  if (!data) return null;
  // Once the quote is with the team nothing can be changed here: only what is still pending is shown.
  const shown = data.sections.filter((section) => section.pending || (data.editable && hasContent(section)));
  // Only a confirmed voice of a section on screen, while the quote is a draft, can be open: if the
  // chat proposes another value, or the voice is gone, nothing stays locked.
  const editedSection = shown.find((section) => section.section_key === editing?.section);
  const open = editing && data.editable && editedSection && voiceConfirmed(editedSection, editing.voice) ? editing : null;
  // What is no longer open must not reopen when the voice comes back.
  if (editing && !open) setEditing(null);
  // Nothing to confirm or change: the card stays only to say how precise the estimate is.
  if (shown.length === 0 && !(mutation.isSuccess && data.precision !== null)) return null;

  const confirm = (section: SectionState, update: ConfirmationUpdate) => {
    const finished = open;
    mutation.mutate(
      { sectionKey: section.section_key, update },
      {
        onSuccess: () => {
          setEditing(null);
          setClosed(finished);
        },
      },
    );
  };
  const cancel = () => {
    // The error of a failed save belongs to the voice just closed.
    mutation.reset();
    setClosed(open);
    setEditing(null);
  };

  return (
    <section
      aria-label="Conferma misure e lavori"
      data-testid="confirmation-card"
      className="not-prose w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface-muted p-4 shadow-1"
    >
      <p className="text-sm font-semibold text-ink">Conferma misure e lavori</p>
      {shown.map((section) => (
        <ConfirmationSection
          key={sectionSignature(section)}
          section={section}
          editable={data.editable}
          saving={mutation.isPending && mutation.variables?.sectionKey === section.section_key}
          locked={mutation.isPending}
          onConfirm={(update) => confirm(section, update)}
          editingVoice={open?.section === section.section_key ? open.voice : null}
          editingElsewhere={open !== null}
          restoreVoice={closed?.section === section.section_key ? closed.voice : null}
          onRestored={() => setClosed(null)}
          onEdit={(voice) => {
            setClosed(null);
            setEditing({ section: section.section_key, voice });
          }}
          onCancelEdit={cancel}
        />
      ))}
      {!data.editable && shown.length > 0 && (
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
