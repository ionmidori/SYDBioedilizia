/**
 * Guest → account claim API (Phase 138 PR-6).
 *
 * Golden Sync with backend_python/src/schemas/guest_claim.py.
 */
import { z } from 'zod';
import { fetchValidated } from '@/lib/api-client';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL || '/api/py';

/** GuestClaimTicket: proof, issued to the anonymous guest, that it is that guest. */
export const guestClaimTicketSchema = z.object({
    ticket: z.string(),
    expires_at: z.string().datetime({ offset: true }),
});

/** GuestClaimResult: the guest's chats now owned by the account, most recent first. */
export const guestClaimResultSchema = z.object({
    session_ids: z.array(z.string()),
    open_session_id: z.string().nullable(),
});

export type GuestClaimTicket = z.infer<typeof guestClaimTicketSchema>;
export type GuestClaimResult = z.infer<typeof guestClaimResultSchema>;

export const guestClaimApi = {
    /** Called while still signed in anonymously: the ID token is the guest's. */
    issueTicket: (): Promise<GuestClaimTicket> =>
        fetchValidated(`${API_ROOT}/guest-claim/ticket`, guestClaimTicketSchema, { method: 'POST' }),

    /** Called once signed in to the account: moves the ticket's guest chats to it. */
    claim: (ticket: string): Promise<GuestClaimResult> =>
        fetchValidated(`${API_ROOT}/guest-claim`, guestClaimResultSchema, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket }),
        }),
};
