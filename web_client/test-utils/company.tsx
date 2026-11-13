/**
 * Test harness for components that read the company identity/hours (Footer, Navbar,
 * legal pages, chat). Lives outside __tests__/ on purpose, like query.tsx.
 */
import { render, type RenderResult } from '@testing-library/react';
import React from 'react';
import { CompanyIdentityProvider, type CompanyHours } from '@/components/providers/CompanyIdentityProvider';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import type { Identity, OpeningHours } from '@/types/company-info';

/** An identity that is not the real one: a test must read it from the provider. */
export const TEST_IDENTITY: Identity = {
    ...SEED_COMPANY_INFO.identity,
    phone: '+39 06 1234567',
    whatsapp: '+39 333 1112223',
    email: 'info@esempio.it',
};

/** Sample opening hours for component tests. */
export const TEST_HOURS: OpeningHours[] = [
    { days: 'Lun-Ven', opens: '09:00', closes: '18:00' },
    { days: 'Sabato', opens: '09:00', closes: '13:00' },
];

export function renderWithCompany(
    ui: React.ReactElement,
    identity: Identity | null = TEST_IDENTITY,
    companyHours: Partial<CompanyHours> = {},
): RenderResult {
    if (identity === null) return render(ui);
    return render(
        <CompanyIdentityProvider
            identity={identity}
            hours={companyHours.hours}
            hoursNote={companyHours.hoursNote}
        >
            {ui}
        </CompanyIdentityProvider>,
    );
}
