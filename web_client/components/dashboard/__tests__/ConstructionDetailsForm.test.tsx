import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConstructionDetailsForm from '../ConstructionDetailsForm';
import { projectsApi } from '@/lib/projects-api';

jest.mock('@/lib/projects-api', () => ({ projectsApi: { updateProjectDetails: jest.fn(() => Promise.resolve()) } }));

const DETAILS = {
    id: 'chat-1', footage_sqm: 90, property_type: 'apartment' as const,
    address: { street: 'Via Roma 1', city: 'Roma', zip: '00100' }, budget_cap: 30000,
    technical_notes: undefined, renovation_constraints: [],
};

describe('ConstructionDetailsForm', () => {
    it('saves the details of the house and refreshes what the dashboard shows of it', async () => {
        const client = new QueryClient();
        const invalidate = jest.spyOn(client, 'invalidateQueries');
        render(
            <QueryClientProvider client={client}>
                <ConstructionDetailsForm sessionId="chat-1" initialData={DETAILS} />
            </QueryClientProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Salva Configurazione/ }));

        await waitFor(() => expect(projectsApi.updateProjectDetails).toHaveBeenCalledWith('chat-1', expect.objectContaining({ footage_sqm: 90 })));
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project', 'chat-1'] }));
        expect(await screen.findByText('Dettagli della casa aggiornati.')).toBeInTheDocument();
    });
});
