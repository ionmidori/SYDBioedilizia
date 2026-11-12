import { render, screen } from '@testing-library/react';
import { ContactActions } from '@/components/chat/ContactActions';
import { VCARD_PATH } from '@/lib/company-info/vcard';
import { TEST_IDENTITY } from '@/test-utils/company';

describe('ContactActions', () => {
    it('offers call, WhatsApp, email and the contact file of the company info', () => {
        render(<ContactActions identity={TEST_IDENTITY} />);
        expect(screen.getByRole('link', { name: 'Chiama' })).toHaveAttribute('href', 'tel:+39061234567');
        expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/393331112223');
        expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:info@esempio.it');
        const save = screen.getByRole('link', { name: 'Salva il contatto di SYD' });
        expect(save).toHaveAttribute('href', VCARD_PATH);
        expect(save).toHaveAttribute('download');
    });

    it('has no WhatsApp link without a WhatsApp number', () => {
        render(<ContactActions identity={{ ...TEST_IDENTITY, whatsapp: null }} />);
        expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Chiama' })).toBeInTheDocument();
    });
});
