'use client';

import { createContext, useContext } from 'react';
import type { Identity } from '@/types/company-info';

const CompanyIdentityContext = createContext<Identity | null>(null);

/**
 * The company identity (name, contacts, address, VAT id) for client components.
 * The root layout reads the company info on the server and passes only the
 * identity: the FAQ and the list of comuni stay out of every page.
 */
export function CompanyIdentityProvider({
    identity,
    children,
}: {
    identity: Identity;
    children: React.ReactNode;
}) {
    return <CompanyIdentityContext.Provider value={identity}>{children}</CompanyIdentityContext.Provider>;
}

/** The identity, or null when no provider is mounted (callers hide what they cannot fill). */
export function useCompanyIdentity(): Identity | null {
    return useContext(CompanyIdentityContext);
}
