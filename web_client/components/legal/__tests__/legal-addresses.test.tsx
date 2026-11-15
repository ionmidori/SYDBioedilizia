import React from 'react';
import { screen } from '@testing-library/react';
import { PrivacyClient } from '@/components/legal/PrivacyClient';
import { TermsClient } from '@/components/legal/TermsClient';
import { fullAddress, legalAddress } from '@/lib/company-info/format';
import { TEST_IDENTITY, renderWithCompany } from '@/test-utils/company';

describe('Legal pages registered and operational addresses', () => {
    it('renders both sede legale and sede operativa in PrivacyClient and TermsClient', () => {
        const expectedLegal = legalAddress(TEST_IDENTITY)!;
        const expectedOperational = fullAddress(TEST_IDENTITY);

        const privacy = renderWithCompany(<PrivacyClient />);
        expect(screen.getByText(new RegExp(`con sede legale in ${expectedLegal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} e sede operativa in ${expectedOperational.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
        privacy.unmount();

        renderWithCompany(<TermsClient />);
        expect(screen.getByText(new RegExp(`con sede legale in ${expectedLegal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} e sede operativa in ${expectedOperational.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
    });

    it('falls back cleanly to sede operativa when legal_address is null', () => {
        const withoutLegal = { ...TEST_IDENTITY, legal_address: null };
        const expectedOperational = fullAddress(withoutLegal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        renderWithCompany(<PrivacyClient />, withoutLegal);
        expect(screen.getByText(new RegExp(`con sede operativa in ${expectedOperational}`))).toBeInTheDocument();
        expect(screen.queryByText(/con sede legale in/)).not.toBeInTheDocument();
    });
});
