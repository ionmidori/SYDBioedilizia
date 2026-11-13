'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Identity, OpeningHours } from '@/types/company-info';

export interface CompanyHours {
    hours: OpeningHours[];
    hoursNote: string;
}

interface CompanyClientValue {
    identity: Identity;
    hours: CompanyHours;
}

const CompanyClientContext = createContext<CompanyClientValue | null>(null);
const EMPTY_HOURS: OpeningHours[] = [];

/**
 * The company identity (name, contacts, address, VAT id) and opening hours for
 * client components. The root layout reads the company info on the server and
 * passes only these fields: the FAQ and the list of comuni stay out of every page.
 */
export function CompanyIdentityProvider({
    identity,
    hours = EMPTY_HOURS,
    hoursNote = '',
    children,
}: {
    identity: Identity;
    hours?: OpeningHours[];
    hoursNote?: string;
    children: React.ReactNode;
}) {
    const value = useMemo(
        () => ({ identity, hours: { hours, hoursNote } }),
        [identity, hours, hoursNote],
    );
    return <CompanyClientContext.Provider value={value}>{children}</CompanyClientContext.Provider>;
}

/** The identity, or null when no provider is mounted (callers hide what they cannot fill). */
export function useCompanyIdentity(): Identity | null {
    return useContext(CompanyClientContext)?.identity ?? null;
}

/** Opening hours and optional note, or null when no provider is mounted. */
export function useCompanyHours(): CompanyHours | null {
    return useContext(CompanyClientContext)?.hours ?? null;
}
