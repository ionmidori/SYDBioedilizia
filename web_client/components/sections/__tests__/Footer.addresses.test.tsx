import React from 'react';
import { screen } from '@testing-library/react';
import { Footer } from '@/components/sections/Footer';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { TEST_IDENTITY, renderWithCompany } from '@/test-utils/company';

describe('Footer — Sede legale e Sede operativa', () => {
    it('renders both Sede legale (Colleferro) and Sede operativa (Roma) when legal_address is set', () => {
        renderWithCompany(<Footer />, SEED_COMPANY_INFO.identity);

        const addressEl = screen.getByText(/Via Quero, 132/).closest('address');
        expect(addressEl).not.toBeNull();
        expect(addressEl).toHaveTextContent('Sede legale:');
        expect(addressEl).toHaveTextContent('Via Venticinque Aprile, 119/A');
        expect(addressEl).toHaveTextContent('00034 Colleferro (RM)');
        expect(addressEl).toHaveTextContent('Sede operativa:');
        expect(addressEl).toHaveTextContent('Via Quero, 132');
        expect(addressEl).toHaveTextContent('00123 Roma (RM)');
    });

    it('renders only Sede operativa when legal_address is null', () => {
        renderWithCompany(<Footer />, { ...TEST_IDENTITY, legal_address: null });

        const addressEl = screen.getByText(/Via Quero, 132/).closest('address');
        expect(addressEl).not.toBeNull();
        expect(addressEl).not.toHaveTextContent('Sede legale:');
        expect(addressEl).toHaveTextContent('Sede operativa:');
        expect(addressEl).toHaveTextContent('Via Quero, 132');
    });
});
