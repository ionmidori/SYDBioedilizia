import React from 'react';
import { render, screen } from '@testing-library/react';

import { closestField, NumberField } from '@/components/admin/company/fields';

describe('closestField', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('is the element with the id when it exists', () => {
        document.body.innerHTML = '<textarea id="company-site_visit-2-items"></textarea><input id="company-site_visit-2-items-0">';
        expect(closestField('company-site_visit-2-items-0')?.id).toBe('company-site_visit-2-items-0');
    });

    it('climbs to the nearest existing id: an entry of a list is edited in the list field', () => {
        document.body.innerHTML = '<textarea id="company-service_area-places"></textarea>';
        expect(closestField('company-service_area-places-3')?.id).toBe('company-service_area-places');
        document.body.innerHTML = '<fieldset id="company-faq-1-answer"></fieldset>';
        expect(closestField('company-faq-1-answer-0-items-2')?.id).toBe('company-faq-1-answer');
    });

    it('is null when nothing of the path is on the page (never the bare "company" prefix)', () => {
        document.body.innerHTML = '<div id="company"></div>';
        expect(closestField('company-hours-0-days')).toBeNull();
    });
});

describe('NumberField', () => {
    it('shows a negative zero without re-rendering forever (String(-0) is "0")', () => {
        render(<NumberField id="n" label="Giorni" value={-0} onChange={() => undefined} />);
        expect(screen.getByLabelText('Giorni')).toHaveValue(0);
    });
});
