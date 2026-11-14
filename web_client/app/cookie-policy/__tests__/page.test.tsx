import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import CookiePolicyPage from '../page';
import { renderWithCompany } from '@/test-utils/company';

describe('CookiePolicyPage', () => {
    it('documents only the three real cookie categories and omits non-existent ones', () => {
        renderWithCompany(<CookiePolicyPage />);

        expect(screen.getByRole('heading', { name: /1\. Cookie Tecnici/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /2\. Cookie Analitici/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /3\. Cookie di Marketing/i })).toBeInTheDocument();

        expect(screen.queryByText(/Cookie Funzionali/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/in basso a sinistra/i)).not.toBeInTheDocument();
    });

    it('provides an action button that reopens the cookie preferences modal', () => {
        const listener = jest.fn();
        window.addEventListener('open_cookie_settings', listener);

        renderWithCompany(<CookiePolicyPage />);
        fireEvent.click(screen.getByRole('button', { name: /gestisci preferenze cookie/i }));

        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener('open_cookie_settings', listener);
    });
});
