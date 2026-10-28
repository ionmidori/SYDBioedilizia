import { useSyncExternalStore } from 'react';
import { guestClaimStore, type GuestClaimState } from '@/lib/auth/guest-claim-store';

const IDLE: GuestClaimState = { status: 'idle' };

/** Outcome of the last guest claim (lib/auth/guest-claim.ts). */
export function useGuestClaim(): GuestClaimState {
    return useSyncExternalStore(guestClaimStore.subscribe, guestClaimStore.get, () => IDLE);
}
