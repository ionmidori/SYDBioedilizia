/**
 * Test harness for components that read the company identity (Footer, Navbar,
 * legal pages, chat). Lives outside __tests__/ on purpose, like query.tsx.
 */
import { render, type RenderResult } from '@testing-library/react';
import React from 'react';
import { CompanyIdentityProvider } from '@/components/providers/CompanyIdentityProvider';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import type { Identity } from '@/types/company-info';

/** An identity that is not the real one: a test must read it from the provider. */
export const TEST_IDENTITY: Identity = {
    ...SEED_COMPANY_INFO.identity,
    phone: '+39 06 1234567',
    whatsapp: '+39 333 1112223',
    email: 'info@esempio.it',
};

export function renderWithCompany(ui: React.ReactElement, identity: Identity | null = TEST_IDENTITY): RenderResult {
    if (identity === null) return render(ui);
    return render(<CompanyIdentityProvider identity={identity}>{ui}</CompanyIdentityProvider>);
}
