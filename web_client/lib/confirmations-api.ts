import { fetchValidated } from '@/lib/api-client';
import {
  type ConfirmationResult,
  type ConfirmationState,
  type ConfirmationUpdate,
  confirmationResultSchema,
  confirmationStateSchema,
  confirmationUpdateSchema,
} from '@/types/confirmation';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

const confirmationsUrl = (projectId: string) => `${API_ROOT}/projects/${encodeURIComponent(projectId)}/confirmations`;

/** The confirmation card (Phase 140, step 3): signed-in owners only, the backend answers 403 to a guest. */
export const confirmationsApi = {
  /** Sections to confirm, the values shown and the precision of the draft's price range. */
  getState: (projectId: string): Promise<ConfirmationState> =>
    fetchValidated(confirmationsUrl(projectId), confirmationStateSchema),

  /**
   * Confirms measures and element choices of one section. The backend recomputes the draft
   * from them (no model call). The body is checked here too: nothing the backend refuses leaves.
   */
  confirm: async (projectId: string, sectionKey: string, update: ConfirmationUpdate): Promise<ConfirmationResult> =>
    fetchValidated(`${confirmationsUrl(projectId)}/${encodeURIComponent(sectionKey)}`, confirmationResultSchema, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmationUpdateSchema.parse(update)),
    }),
};
