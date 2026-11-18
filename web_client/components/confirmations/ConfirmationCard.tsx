'use client';

import { useState } from 'react';
import { useConfirmationMutation, useConfirmations } from '@/hooks/use-confirmations';
import { describeApiError } from '@/lib/api-client';
import type { ConfirmationResult, ConfirmationUpdate, SectionState } from '@/types/confirmation';
import { ConfirmationSection } from './ConfirmationSection';
import { type SaveOrigin, voiceConfirmed } from './pending';

/** A confirmed section is worth showing only if there is something in it to change. */
const hasContent = (section: SectionState) => section.measures.length + section.element_choices.length > 0;

const ROOMS = new Intl.ListFormat('it', { type: 'conjunction' });

/**
 * Why the estimate was not updated: the rooms still missing a measure. Named only when every one
 * of the `total` blocked sections has a name (a project without rooms has none).
 */
function blockedNote(sections: readonly SectionState[], total = sections.length): string {
  const rooms = sections.flatMap((section) => (section.label === null ? [] : [section.label]));
  return rooms.length > 0 && rooms.length === total
    ? `Stima non aggiornata: manca una misura in ${ROOMS.format(rooms)}.`
    : 'Stima non aggiornata: manca ancora una misura.';
}

/** What a screen reader hears once a section is saved. */
function savedMessage(section: SectionState, result: ConfirmationResult): string {
  const saved = section.label === null ? 'Confermato.' : `${section.label}: confermato.`;
  if (result.recalculated) return `${saved} Stima aggiornata.`;
  if (result.blocked_sections.length === 0) return saved;
  const blocked = result.state.sections.filter((s) => result.blocked_sections.includes(s.section_key));
  return `${saved} ${blockedNote(blocked, result.blocked_sections.length)}`;
}

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
  // Which button saved: only that one says "Salvo…".
  const [origin, setOrigin] = useState<SaveOrigin | null>(null);
  // Read by a screen reader: the save, then its result (a failure is the alert below).
  const [announcement, setAnnouncement] = useState('');
  // The sections the last save left without a recomputed estimate.
  const [blocked, setBlocked] = useState<readonly string[]>([]);

  if (!data) return null;
  // Once the quote is with the team nothing can be changed here: only what is still pending is shown.
  const shown = data.sections.filter((section) => section.pending || (data.editable && hasContent(section)));
  // Only a confirmed voice of a section on screen, while the quote is a draft, can be open: if the
  // chat proposes another value, or the voice is gone, nothing stays locked.
  const editedSection = shown.find((section) => section.section_key === editing?.section);
  const open = editing && data.editable && editedSection && voiceConfirmed(editedSection, editing.voice) ? editing : null;
  // What is no longer open must not reopen when the voice comes back.
  if (editing && !open) setEditing(null);
  // Beside the card, always in the same place: a live region added together with its text is not
  // read, and the last save can close the card while its result is still to be said.
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );
  // Nothing to confirm or change: the card stays only to say how precise the estimate is.
  if (shown.length === 0 && !(mutation.isSuccess && data.precision !== null)) {
    return announcement ? (
      <>
        {null}
        {liveRegion}
      </>
    ) : null;
  }

  const saving = mutation.isPending ? origin : null;
  // Only what still misses a measure: a section confirmed since (from the chat too) drops out.
  const stillBlocked = data.sections.filter((section) => section.pending && blocked.includes(section.section_key));

  const confirm = (section: SectionState, update: ConfirmationUpdate, voice: string | null) => {
    const finished = open;
    setOrigin({ section: section.section_key, voice });
    setAnnouncement('Salvataggio…');
    mutation.mutate(
      { sectionKey: section.section_key, update },
      {
        onSuccess: (result) => {
          setEditing(null);
          setClosed(finished);
          setBlocked(result.recalculated ? [] : result.blocked_sections);
          setAnnouncement(savedMessage(section, result));
        },
        onError: () => setAnnouncement(''),
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
    <>
      <section
        aria-label="Conferma misure e lavori"
        data-testid="confirmation-card"
        className="not-prose w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface-muted p-4 shadow-1"
      >
        <p className="text-sm font-semibold text-ink">Conferma misure e lavori</p>
        {shown.map((section) => (
          <ConfirmationSection
            key={section.section_key}
            section={section}
            editable={data.editable}
            saving={saving?.section === section.section_key ? saving : null}
            locked={mutation.isPending}
            onConfirm={(update, voice) => confirm(section, update, voice)}
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
        {stillBlocked.length > 0 && <p className="text-xs text-warning-ink">{blockedNote(stillBlocked)}</p>}
        {data.precision !== null && (
          <p className="text-sm font-medium text-success-ink">Stima precisa al {data.precision} %</p>
        )}
      </section>
      {liveRegion}
    </>
  );
}
